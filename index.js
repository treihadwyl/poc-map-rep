
var canvas = document.querySelector( '.canvas' )
var ctx = window.ctx = canvas.getContext( '2d' )

import EventEmitter from 'eventemitter3'

var ndarray = window.ndarray = require( 'ndarray' )
var unpack = window.unpack = require( 'ndarray-unpack' )
var fill = window.fill = require( 'ndarray-fill' )

const WIDTH = window.WIDTH = 10
const HEIGHT = window.HEIGHT = 10

const CANVAS_WIDTH = 640
const CANVAS_HEIGHT = 480
const BLOCK_SIZE = 40


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
  ( WIDTH + 1 ) * HEIGHT,
  ( ( WIDTH + 1 ) * HEIGHT ) + ( WIDTH * ( HEIGHT + 1 ) )
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
    this.data = ndarray( new Uint8Array( buffer ), [ width, height ] )
  }

  get width() {
    return this.data.shape[ 0 ]
  }
  get height() {
    return this.data.shape[ 1 ]
  }
  get( x, y ) {
    if ( !checkBounds( x, 0, this.width ) || !checkBounds( y, 0, this.height ) ) {
      throw new Error( 'out of bounds' )
    }
    return this.data.get( x, y )
  }
  set( x, y, value ) {
    if ( !checkBounds( x, 0, this.width ) || !checkBounds( y, 0, this.height ) ) {
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
  }
}

var map = window.map = new MapFormat( buf )


/**
 * Provides lookup getters to the underlying mapformat
 */
class Walls {
  constructor( x, y ) {
    Object.defineProperties( this, {
      'N': {
        get: () => map.wallH.get( x, y ),
        set: value => map.wallH.set( x, y, value )
      },
      'E': {
        get: () => map.wallV.get( x + 1, y ),
        set: value => map.wallV.set( x + 1, y, value )
      },
      'S': {
        get: () => map.wallH.get( x, y + 1 ),
        set: value => map.wallH.set( x, y + 1, value )
      },
      'W': {
        get: () => {
          return map.wallV.get( x, y )
        },
        set: value => {
          map.wallV.set( x, y, value )
        }
      }
    })
  }
  fill( value ) {
    this.N = value
    this.E = value
    this.S = value
    this.W = value
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
  ctx.fillRect( x * BLOCK_SIZE + 1, y * BLOCK_SIZE + 1, BLOCK_SIZE - 1, BLOCK_SIZE - 1 )

  // render each wall segment
  ctx.strokeStyle = getColor( 4 )

  // N
  ctx.beginPath()
  ctx.moveTo( x * BLOCK_SIZE, y * BLOCK_SIZE )
  ctx.lineTo( ( x + 1 ) * BLOCK_SIZE, y * BLOCK_SIZE )
  ctx.stroke()

  // S
  ctx.beginPath()
  ctx.moveTo( x * BLOCK_SIZE, ( y + 1 ) * BLOCK_SIZE )
  ctx.lineTo( ( x + 1 ) * BLOCK_SIZE, ( y + 1 ) * BLOCK_SIZE )
  ctx.stroke()

  // E
  ctx.beginPath()
  ctx.moveTo( ( x + 1 ) * BLOCK_SIZE, y * BLOCK_SIZE )
  ctx.lineTo( ( x + 1 ) * BLOCK_SIZE, ( y + 1 ) * BLOCK_SIZE )
  ctx.stroke()
  // W
  ctx.beginPath()
  ctx.moveTo( x * BLOCK_SIZE, y * BLOCK_SIZE )
  ctx.lineTo( x * BLOCK_SIZE, ( y + 1 ) * BLOCK_SIZE )
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
    .onClick( x, y )
})

// document.querySelector( '.js-rotcw' ).addEventListener( 'click', event => rotateCW() )
// document.querySelector( '.js-rotccw' ).addEventListener( 'click', event => rotateCCW() )
// document.querySelector( '.js-rot180' ).addEventListener( 'click', event => rotate180() )
