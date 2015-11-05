
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

// Source of truth - underlying data store
var buf = window.buf = new ArrayBuffer( WIDTH * HEIGHT )

// Just a view on to the data
var view = window.view = new Uint8Array( buf )

// Uses the view to access the buffer
var arr = window.arr = ndarray( view, [ WIDTH, HEIGHT ] )

fill( arr, ( x, y ) => {
  return 0
})

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


/**
 * Holds the raw 2d array data
 */
window.Raw = class Raw extends EventEmitter {
  constructor( offset, width, height ) {
    super()
    this.data = ndarray( new Uint8Array( buf ), [ width, height ] )
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
  constructor() {
    super()

    this.floor = new Raw( 0, WIDTH, HEIGHT )
    this.wallH = new Raw( 0, WIDTH, HEIGHT )
    this.wallV = new Raw( 0, WIDTH, HEIGHT )

    this.floor.on( 'update', render )
  }
}

var map = window.map = new MapFormat()


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
}

/**
 * Create the working list of tiles
 */
var tiles = window.tiles = []
for ( let y = 0; y < HEIGHT; y++ ) {
  for ( let x = 0; x < WIDTH; x++ ) {
    tiles.push( new Tile( x, y ) )
  }
}


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
}

var render = window.render = function render() {
  ctx.clearRect( 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT )
  // arr.shape[ 0 ] === width, but why hold on to width when the ndarray
  // holds its shape anyway
  for ( var x = 0; x < arr.shape[ 0 ]; x++ ) {
    for ( var y = 0; y < arr.shape[ 1 ]; y++ ) {
      renderTile( x, y, tiles[ x + WIDTH * y ] )
    }
  }
}

render()


document.querySelector( '.js-rotcw' ).addEventListener( 'click', event => rotateCW() )
document.querySelector( '.js-rotccw' ).addEventListener( 'click', event => rotateCCW() )
document.querySelector( '.js-rot180' ).addEventListener( 'click', event => rotate180() )
