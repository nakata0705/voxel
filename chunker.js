var events = require('events')
var inherits = require('inherits')

module.exports = function(opts) {
  return new Chunker(opts)
}

module.exports.Chunker = Chunker

function Chunker(opts) {
  this.distance = opts.chunkDistance || 2
  this.chunkSize = opts.chunkSize || 32
  this.chunkPad = opts.chunkPad !== undefined ? opts.chunkPad : 0
  this.cubeSize = opts.cubeSize || 25
  this.generateVoxelChunk = opts.generateVoxelChunk
  this.chunks = {}
  this.meshes = {}
  this.bodiesArray = {}

  if (this.chunkSize & this.chunkSize-1 !== 0)
    throw new Error('chunkSize must be a power of 2')
  var bits = 0;
  for (var size = this.chunkSize; size > 0; size >>= 1) bits++;
  this.chunkBits = bits - 1;
  this.chunkMask = (1 << this.chunkBits) - 1
  this.chunkPadHalf = this.chunkPad >> 1
}

inherits(Chunker, events.EventEmitter)

Chunker.prototype.nearbyChunks = function(position, distance) {
  var cpos = this.chunkAtPosition(position)
  return this.nearbyChunksCoordinate(cpos, distance);
}

Chunker.prototype.nearbyChunksCoordinate = function(cpos, distance) {
  var x = cpos[0]
  var y = cpos[1]
  var z = cpos[2]
  var dist = distance || this.distance
  var nearby = []
  if (dist === 0) {
      nearby.push([x, y, z]);
  }
  else {
    for (var cx = (x - dist); cx !== (x + dist); ++cx) {
      for (var cy = (y - dist); cy !== (y + dist); ++cy) {
        for (var cz = (z - dist); cz !== (z + dist); ++cz) {
          nearby.push([cx, cy, cz])
        }
      }
    }
  }
  return nearby
}

Chunker.prototype.requestMissingChunks = function(position) {
  var self = this
  this.nearbyChunks(position).map(function(chunk) {
    if (!self.chunks[chunk.join('|')]) {
      self.emit('missingChunk', chunk)
    }
  })
}

Chunker.prototype.getBounds = function(x, y, z) {
  var bits = this.chunkBits
  var low = [x << bits, y << bits, z << bits]
  var high = [(x+1) << bits, (y+1) << bits, (z+1) << bits]
  return [low, high]
}

Chunker.prototype.generateChunk = function(x, y, z) {
  var self = this
  var bounds = this.getBounds(x, y, z)
  var chunk = this.generateVoxelChunk(bounds[0], bounds[1], x, y, z)
  var position = [x, y, z]
  chunk.position = position
  this.chunks[position.join('|')] = chunk
  return chunk
}

Chunker.prototype.getChunk = function(x, y, z) {
  var cpos = [x, y, z];
  var ckey = cpos.join('|')
  var chunk = this.chunks[ckey]
  if (chunk) return chunk
  else return undefined  
}

Chunker.prototype.deleteChunk = function(x, y, z) {
  var cpos = [x, y, z];
  var ckey = cpos.join('|')
  var chunk = this.chunks[ckey]
  if (chunk) delete this.chunks[ckey]; 
}

Chunker.prototype.getMeshes = function (x, y, z) {
  var cpos = [x, y, z];
  var ckey = cpos.join('|')
  var meshes = this.meshes[ckey]
  if (meshes) return meshes
  else return undefined  
}

Chunker.prototype.setMeshes = function (x, y, z, mesh) {
  var cpos = [x, y, z];
  var ckey = cpos.join('|')
  if (mesh === undefined) this.meshes[ckey] = undefined
  if (!this.meshes[ckey]) this.meshes[ckey] = [mesh]
  else this.meshes[ckey].push(mesh)
}

Chunker.prototype.getBodies = function (x, y, z) {
  var cpos = [x, y, z];
  var ckey = cpos.join('|')
  var bodies = this.bodiesArray[ckey]
  if (bodies) return bodies
  else return undefined  
}

Chunker.prototype.setBodies = function (x, y, z, bodies) {
  var cpos = [x, y, z];
  var ckey = cpos.join('|')
  this.bodiesArray[ckey] = bodies
  return bodies;
}

Chunker.prototype.chunkAtCoordinates = function(x, y, z) {
  var bits = this.chunkBits;
  var cx = x >> bits;
  var cy = y >> bits;
  var cz = z >> bits;
  var chunkPos = [cx, cy, cz];
  return chunkPos;
}

Chunker.prototype.chunkAtPosition = function(position) {
  var cubeSize = this.cubeSize;
  var x = Math.floor(position[0] / cubeSize)
  var y = Math.floor(position[1] / cubeSize)
  var z = Math.floor(position[2] / cubeSize)
  var chunkPos = this.chunkAtCoordinates(x, y, z)
  return chunkPos
};

Chunker.prototype.voxelIndexFromCoordinates = function(x, y, z) {
  throw new Error('Chunker.prototype.voxelIndexFromCoordinates removed, use voxelAtCoordinates')
}

Chunker.prototype.voxelAtCoordinates = function(x, y, z, val, auto) {
  var cpos = this.chunkAtCoordinates(x, y, z)
  var ckey = cpos.join('|')
  var chunk = this.chunks[ckey]
  if (chunk === undefined) {
      // もしチャンクが存在せず、新規に代入されたボクセル値が0あるいはundefinedなら、自動的にチャンクを作成する設定でも新しいチャンクは作成しない
      if (val === 0) return [0, null]
      if (auto && typeof val !== 'undefined') chunk = this.generateChunk(cpos[0], cpos[1], cpos[2])
      else return [0, null]
  } 
  
  // チャンクの周囲に設定したパディングを考慮してボクセル値を代入する
  var mask = this.chunkMask
  var h = this.chunkPadHalf
  var mx = x & mask
  var my = y & mask
  var mz = z & mask
  var v = chunk.get(mx+h, my+h, mz+h)
  if (typeof val !== 'undefined') {
    chunk.set(mx+h, my+h, mz+h, val)
    
    // [ToDo] このコードはチャンクをクラス化したら、内部処理として取り込む
    if (val !== 0x00) chunk.empty = false
  }
  return [v, chunk]
}

Chunker.prototype.voxelAtPosition = function(pos, val, auto) {
  var cubeSize = this.cubeSize;
  var x = Math.floor(pos[0] / cubeSize)
  var y = Math.floor(pos[1] / cubeSize)
  var z = Math.floor(pos[2] / cubeSize)
  var v = this.voxelAtCoordinates(x, y, z, val, auto)
  return v;
}

