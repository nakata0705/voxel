var GreedyMesh = (function greedyLoader() {
    
// スキャン方向に正面の面の情報を入れる
var mask = new Uint32Array(4096);
// スキャン方向に背面の面の情報を入れる
var invMask = new Uint32Array(4096);

// 32bitのボクセルIDで表現されるスペースのうち、最上位ビットは透明フラグとする
var kTransparentMask    = 0x80000000;
// 32bitのボクセルIDで表現されるスペースのうち、残りの3ビットはボクセルの正面方向を指定するフラグとする
var kFaceDirectionMask	= 0x70000000;
var kNoFlagsMask        = 0x0FFFFFFF;

function isTransparent(v) {
  return (v & kTransparentMask) === kTransparentMask;
}

function removeFlags(v) {
  return (v & kNoFlagsMask);
}

return function ohSoGreedyMesher(volume, dims, mesherExtraData) {
  var vertices = [], faces = []
    , dimsX = dims[0]
    , dimsY = dims[1]
    , dimsXY = dimsX * dimsY;

  var tVertices = [], tFaces = []

  var transparentTypes = mesherExtraData ? (mesherExtraData.transparentTypes || {}) : {};
  var getType = function(voxels, offset) {
    var type = voxels[offset].v;
    return type | (type in transparentTypes ? kTransparentMask : 0);
  }


  //Sweep over 3-axes
  for(var d=0; d<3; ++d) {
    var i, j, k, l, w, W, h, n, c
      , u = (d+1)%3 //d === 0 ? 2 : d === 1 ? 2 : 0
      , v = (d+2)%3 //d === 0 ? 1 : d === 1 ? 0 : 1
      , x = [0,0,0]
      , q = [0,0,0]
      , du = [0,0,0]
      , dv = [0,0,0]
      , dimsD = dims[d]
      , dimsU = dims[u]
      , dimsV = dims[v]
      , qdimsX, qdimsXY
      , xd

    if (mask.length < dimsU * dimsV) {
      mask = new Uint32Array(dimsU * dimsV);
      invMask = new Uint32Array(dimsU * dimsV);
    }

    q[d] =  1;
    x[d] = -1;

    qdimsX  = dimsX  * q[1]
    qdimsXY = dimsXY * q[2]

    // Compute mask
    while (x[d] < dimsD) {
      xd = x[d]
      n = 0;

      for(x[v] = 0; x[v] < dimsV; ++x[v]) {
        for(x[u] = 0; x[u] < dimsU; ++x[u], ++n) {
          // Modified to read through getType()
          var a = xd >= 0      && getType(volume, x[0]      + dimsX * x[1]          + dimsXY * x[2]          )
            , b = xd < dimsD-1 && getType(volume, x[0]+q[0] + dimsX * x[1] + qdimsX + dimsXY * x[2] + qdimsXY)

          if (isTransparent(a) && isTransparent(b)) {
            if (a !== b) {
              // 両面が透明だが、それぞれの素材が違うため、両面とも描画する
              mask[n] = a;
              invMask[n] = b;
            }
            else {
              // 両面が透明でかつ同じ素材なので、描画しない
              mask[n] = 0;
              invMask[n] = 0;
            }
          } else if (a && (!b || isTransparent(b))) {
            // aが不透明でbが存在しないか半透明
            mask[n] = a;
            invMask[n] = 0
          } else if (b && (!a || isTransparent(a))) {
            // bが不透明でaが存在しないか半透明
            mask[n] = 0
            invMask[n] = b;
          } else {
            // 描画の必要なし
            mask[n] = 0
            invMask[n] = 0
          }
        }
      }

      ++x[d];

      // Generate mesh for mask using lexicographic ordering
      function generateMesh(mask, dimsV, dimsU, vertices, faces, clockwise) {
        clockwise = clockwise === undefined ? true : clockwise;
        var n, j, i, c, w, h, k, du = [0,0,0], dv = [0,0,0];
        n = 0;
        for (j=0; j < dimsV; ++j) {
          for (i=0; i < dimsU; ) {
            c = mask[n];
            if (!c) {
              i++;  n++; continue;
            }

            //Compute width
            w = 1;
            while (c === mask[n+w] && i+w < dimsU) w++;

            //Compute height (this is slightly awkward)
            for (h=1; j+h < dimsV; ++h) {
              k = 0;
              while (k < w && c === mask[n+k+h*dimsU]) k++
              if (k < w) break;
            }

            // Add quad
            // The du/dv arrays are reused/reset
            // for each iteration.
            du[d] = 0; dv[d] = 0;
            x[u]  = i;  x[v] = j;

            if (clockwise) {
            // if (c > 0) {
              dv[v] = h; dv[u] = 0;
              du[u] = w; du[v] = 0;
            } else {
              // c = -c;
              du[v] = h; du[u] = 0;
              dv[u] = w; dv[v] = 0;
            }
            
            var vertex_count
            if (!isTransparent(c)) {
              // 不透明な頂点と面としてバッファに値を追加
              vertex_count = vertices.length;
              vertices.push([x[0],             x[1],             x[2]            ]);
              vertices.push([x[0]+du[0],       x[1]+du[1],       x[2]+du[2]      ]);
              vertices.push([x[0]+du[0]+dv[0], x[1]+du[1]+dv[1], x[2]+du[2]+dv[2]]);
              vertices.push([x[0]      +dv[0], x[1]      +dv[1], x[2]      +dv[2]]);
              faces.push([vertex_count, vertex_count+1, vertex_count+2, vertex_count+3, c]);
            } else {
              // 透明な頂点と面としてバッファに値を追加
               vertex_count = tVertices.length;
               tVertices.push([x[0],             x[1],             x[2]            ]);
               tVertices.push([x[0]+du[0],       x[1]+du[1],       x[2]+du[2]      ]);
               tVertices.push([x[0]+du[0]+dv[0], x[1]+du[1]+dv[1], x[2]+du[2]+dv[2]]);
               tVertices.push([x[0]      +dv[0], x[1]      +dv[1], x[2]      +dv[2]]);
               tFaces.push([vertex_count, vertex_count+1, vertex_count+2, vertex_count+3, c]);
            }

            //Zero-out mask
            W = n + w;
            for(l=0; l<h; ++l) {
              for(k=n; k<W; ++k) {
                mask[k+l*dimsU] = 0;
              }
            }

            //Increment counters and continue
            i += w; n += w;
          }
        }
      }
      generateMesh(mask, dimsV, dimsU, vertices, faces, true)
      generateMesh(invMask, dimsV, dimsU, vertices, faces, false)
    }
  }
  
  // 透明部分と不透明部分を分離した状態で返す
  return { vertices:vertices, tVertices: tVertices, faces:faces, tFaces: tFaces }
}
})();

if(exports) {
  exports.mesher = GreedyMesh;
}
