
import EventEmitter from 'eventemitter3'

import ndarray from 'ndarray'
import unpack from 'ndarray-unpack'
import fill from 'ndarray-fill'

import leveljs from 'level-js'
import levelup from 'levelup'
import promisify from 'level-promisify'

const WIDTH = window.WIDTH = 2
const HEIGHT = window.HEIGHT = 2

const CANVAS_WIDTH = 640
const CANVAS_HEIGHT = 480
const BLOCK_SIZE = 48

var canvas = document.querySelector( '.canvas' )
var ctx = window.ctx = canvas.getContext( '2d' )


/**
 * Helpers
 */
function clamp( num, min, max ) {
  return num < min ? min : num > max ? max : num
}

function checkBounds( num, min, max ) {
  if ( num < min || num > max ) {
    return false
  }
  return true
}


// Array offsets into floor, wallH, wallV
var offsets = [
  0,
  WIDTH * HEIGHT,
  ( WIDTH * HEIGHT ) + ( WIDTH * ( HEIGHT + 1 ) )
]

// Quick total byte length of array
var byteLength = ( ( WIDTH * HEIGHT ) +
  ( WIDTH * ( HEIGHT + 1 ) ) +
  ( ( WIDTH + 1 ) * HEIGHT ) )

// Source of truth - underlying data store
var buf = window.buf = new ArrayBuffer( byteLength )

// A debug view on the data
var view = window.view = new Uint8Array( buf )

/**
 * Holds the raw 2d array data
 */
window.Raw = class Raw extends EventEmitter {
  constructor( buffer, offset, width, height ) {
    super()
    this.data = ndarray( new Uint8Array( buffer ), [ width, height ], [ height, 1 ], offset )
  }

  get width() {
    return this.data.shape[ 0 ]
  }
  get height() {
    return this.data.shape[ 1 ]
  }
  get( x, y ) {
    if ( !checkBounds( x, 0, this.width - 1 ) || !checkBounds( y, 0, this.height - 1 ) ) {
      throw new Error( 'out of bounds' )
    }
    return this.data.get( x, y )
  }
  set( x, y, value ) {
    if ( !checkBounds( x, 0, this.width - 1 ) || !checkBounds( y, 0, this.height - 1 ) ) {
      throw new Error( 'out of bounds' )
    }
    this.data.set( x, y, value )
    this.emit( 'update' )
  }
  fill( value, fn ) {
    fill( this.data, ( x, y ) => value )
  }
}

/**
 * Holds the entire map, i.e. all the sections
 */
class MapFormat extends EventEmitter {
  constructor( buffer ) {
    super()

    this.floor = new Raw( buffer, offsets[ 0 ], WIDTH, HEIGHT )
    this.wallH = new Raw( buffer, offsets[ 1 ], WIDTH, HEIGHT + 1 )
    this.wallV = new Raw( buffer, offsets[ 2 ], WIDTH + 1, HEIGHT )

    this.floor.on( 'update', () => render() )
    this.wallH.on( 'update', () => render() )
    this.wallV.on( 'update', () => render() )

    this.buf = buffer
    this.saveKey = 'tr_map'

    /**
     * Wrap leveljs in levelup, then wrap in promisify to get a promise
     * based API
     */
    this.db = promisify( levelup( 'TRmap', {
      db: leveljs,
      valueEncoding: 'binary'
    }))
  }

  save() {
    // Stuff raw binary map data into idb
    this.db.put( this.saveKey, this.buf )
      .then( () => {
        console.log( 'map saved to database' )
      })
      .catch( err => {
        console.error( 'Error saving to idb' )
        console.error( err )
      })
  }

  load( format ) {
    this.db.get( this.saveKey )
      .then( data => {
        // @TODO best way?
        let total = new Uint8Array( this.buf )
        data.forEach( ( char, index ) => {
          total[ index ] = char
        })

        console.log( 'map loaded from db' )
        this.emit( 'update' )
      })
      .catch( err => {
        console.error( 'Error retrieving data' )
        console.error( err )
      })
  }
}

var map = window.map = new MapFormat( buf )
map.on( 'update', () => render() )

/**
 * Provides lookup getters to the underlying mapformat
 */
class Walls {
  constructor( x, y ) {
    this.dir = [ 'N', 'E', 'S', 'W' ]
    this.x = x
    this.y = y

    this._makeProps( this.x, this.y )
  }
  _makeProps( x, y ) {
    Object.defineProperties( this, {
      [ this.dir[ 0 ] ]: {
        get: () => map.wallH.get( x, y ),
        set: value => map.wallH.set( x, y, value ),
        configurable: true
      },
      [ this.dir[ 1 ] ]: {
        get: () => map.wallV.get( x + 1, y ),
        set: value => map.wallV.set( x + 1, y, value ),
        configurable: true
      },
      [ this.dir[ 2 ] ]: {
        get: () => map.wallH.get( x, y + 1 ),
        set: value => map.wallH.set( x, y + 1, value ),
        configurable: true
      },
      [ this.dir[ 3 ] ]: {
        get: () => {
          return map.wallV.get( x, y )
        },
        set: value => {
          map.wallV.set( x, y, value )
        },
        configurable: true
      }
    })
  }
  fill( value ) {
    this.dir.forEach( dir => {
      this[ dir ] = value
    })
  }
  log() {
    let faces = [ 'N', 'E', 'S', 'W' ]
    console.log( ...faces.map( dir => this[ dir ] ) )
  }
  rotate() {
    this.dir = [ 'W', 'N', 'E', 'S' ]
    this._makeProps( this.x, this.y )
  }
}

/**
 * Use floor array to hold an object representing the tile, with
 * wall segments as pointers
 */
class Tile {
  constructor( x, y ) {
    // This is all cool with the lookups
    this.walls = new Walls( x, y )

    Object.defineProperty( this, 'type', {
      get: function() {
        return map.floor.get( x, y )
      },
      set: function( value ) {
        map.floor.set( x, y, value )
      }
    })
  }

  /**
   * Currently expects x and y clamped 0...1, 0,0 is TL, 1,1 is BR
   */
  onClick( x, y ) {
    let shield = .1

    if ( y < shield ) {
      this.walls.N = !this.walls.N
      return
    }
    if ( y > 1 - shield ) {
      this.walls.S = !this.walls.S
      return
    }
    if ( x < shield ) {
      this.walls.W = !this.walls.W
      return
    }
    if ( x > 1 - shield ) {
      this.walls.E = !this.walls.E
      return
    }


    this.type = !this.type
  }
}

/**
 * Create the working list of tiles
 */
class Tiles {
  constructor() {
    this.tiles = []
    for ( let y = 0; y < HEIGHT; y++ ) {
      for ( let x = 0; x < WIDTH; x++ ) {
        this.tiles.push( new Tile( x, y ) )
      }
    }
  }
  get( x, y ) {
    return this.tiles[ x + WIDTH * y ]
  }
  set( x, y, tile ) {
    this.tiles[ x + WIDTH * y ] = tile
  }

  rotateFaces() {
    this.tiles.forEach( tile => {
      tile.walls.rotate()
    })
  }
}

var tiles = window.tiles = new Tiles()


/**
 * Only works for square matrices
 */
window.transform = function transform( fn ) {
  var start = performance.now()
  fn = fn || function iterate( y, x ) {
    return arr.get( x, arr.shape[ 1 ] - 1 - y )
  }

  fill( res, fn )

  res.data.forEach( ( val, index ) => {
    arr.data[ index ] = val
  })
  console.log( 'time', performance.now() - start )
  render()
  logdata( arr )
}

window.rotateCW = function rotateCW() {
   transform( ( y, x ) => {
    return arr.get( x, arr.shape[ 1 ] - 1 - y )
  })
}
window.rotateCCW = function rotateCCW() {
  transform( ( y, x ) => {
    return arr.get( arr.shape[ 0 ] - 1 - x, y )
  })
}
window.rotate180 = function rotate180() {
  transform( ( y, x ) => {
    return arr.get( arr.shape[ 1 ] - 1 - y, arr.shape[ 0 ] - 1 - x )
  })
}


/**
 * logs the array in 2d
 * transforms from row major to cartesian
 */
window.logdata = function logdata( nda ) {
  if ( nda.size > 255 ) {
    return
  }
  let d = unpack( nda )
  console.log( '---' )
  for ( let y = 0; y < nda.shape[ 1 ]; y++ ) {
    let row = []
    for ( let x = 0; x < nda.shape[ 0 ]; x++ ) {
      row.push( d[ x ][ y ] )
    }
    console.log( ...row )
  }
  console.log( '---' )
}


/**
 * Blanket render everything
 */
var colors = [
  'rgb( 20, 12, 28 )',
  'rgb( 47, 72, 78 )',
  'rgb( 68, 137, 26 )',
  'rgb( 163, 206, 39 )',
  'rgb( 247, 226, 107 )'
]
function getColor( value ) {
  if ( value < 0 || value > colors.length - 1 ) {
    return 'rgb( 235, 137, 49 )'
  }
  return colors[ value ]
}

/**
 * Renders the tile data at location x, y on screen
 */
function renderTile( x, y, tile ) {
  ctx.fillStyle = getColor( tile.type )
  ctx.fillRect( ( x * BLOCK_SIZE ), ( y * BLOCK_SIZE ), BLOCK_SIZE, BLOCK_SIZE )

  // render each wall segment
  // ctx.strokeStyle = getColor( 4 )

  // N
  ctx.strokeStyle = getColor( tile.walls.N ? 4 : 0 )
  ctx.beginPath()
  ctx.moveTo( x * BLOCK_SIZE, y * BLOCK_SIZE )
  ctx.lineTo( ( x + 1 ) * BLOCK_SIZE - 1, y * BLOCK_SIZE )
  ctx.stroke()
  // S
  ctx.strokeStyle = getColor( tile.walls.S ? 4 : 0 )
  ctx.beginPath()
  ctx.moveTo( x * BLOCK_SIZE, ( y + 1 ) * BLOCK_SIZE - 1 )
  ctx.lineTo( ( x + 1 ) * BLOCK_SIZE - 1, ( y + 1 ) * BLOCK_SIZE - 1 )
  ctx.stroke()
  // E
  ctx.strokeStyle = getColor( tile.walls.E ? 4 : 0 )
  ctx.beginPath()
  ctx.moveTo( ( x + 1 ) * BLOCK_SIZE - 1, y * BLOCK_SIZE )
  ctx.lineTo( ( x + 1 ) * BLOCK_SIZE - 1, ( y + 1 ) * BLOCK_SIZE - 1 )
  ctx.stroke()
  // W
  ctx.strokeStyle = getColor( tile.walls.W ? 4 : 0 )
  ctx.beginPath()
  ctx.moveTo( x * BLOCK_SIZE, y * BLOCK_SIZE )
  ctx.lineTo( x * BLOCK_SIZE, ( y + 1 ) * BLOCK_SIZE - 1 )
  ctx.stroke()
}

var render = function render() {
  //console.log( 'render' )
  ctx.clearRect( 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT )
  for ( var x = 0; x < WIDTH; x++ ) {
    for ( var y = 0; y < HEIGHT; y++ ) {
      renderTile( x, y, tiles.get( x, y ) )
    }
  }
}
window.render = render
render()


canvas.addEventListener( 'mousedown', event => {
  // Transform canvas coords to tile map coords
  // @TODO does not consider canvas touches outside of rendered area
  let x = event.offsetX / BLOCK_SIZE
  let y = event.offsetY / BLOCK_SIZE
  tiles.get( ~~x, ~~y )
    .onClick( x - ~~x, y - ~~y )
})

/**
 * Add ui listeners
 */
document.querySelector( '.js-save' ).addEventListener( 'click', event => map.save() )
document.querySelector( '.js-load' ).addEventListener( 'click', event => map.load() )
// document.querySelector( '.js-rotcw' ).addEventListener( 'click', event => rotateCW() )
// document.querySelector( '.js-rotccw' ).addEventListener( 'click', event => rotateCCW() )
// document.querySelector( '.js-rot180' ).addEventListener( 'click', event => rotate180() )
