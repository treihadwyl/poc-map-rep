
import EventEmitter from 'eventemitter3'

import ndarray from 'ndarray'
import unpack from 'ndarray-unpack'
import fill from 'ndarray-fill'
import rotate from 'rotate-array'

import leveljs from 'level-js'
import levelup from 'levelup'
import promisify from 'level-promisify'

const WIDTH = window.WIDTH = 3
const HEIGHT = window.HEIGHT = 3

const CANVAS_WIDTH = 640
const CANVAS_HEIGHT = 480
const BLOCK_SIZE = 60

var canvas = document.querySelector( '.canvas' )
var ctx = window.ctx = canvas.getContext( '2d' )

/**
 * This version has some overlap of the walls so there is some redundancy but
 * by making each array square it can be rotated far more easily
 * If walls are 3x3 then the walkable floor area will be 2x2
 */


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
  ( ( WIDTH - 1 ) * ( HEIGHT - 1 ) ),
  ( ( WIDTH - 1 ) * ( HEIGHT - 1 ) ) + ( WIDTH * HEIGHT )
]

// Quick total byte length of array
var byteLength = (
  ( ( WIDTH -1 ) * ( HEIGHT - 1 ) ) +
  ( WIDTH * HEIGHT * 2 )
)

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

  transform( fn ) {
    if ( !fn ) {
      throw new Error( 'Transforming raw data ndarray requires transformation function')
    }

    let width = this.data.shape[ 0 ]
    let height = this.data.shape[ 1 ]
    let tmp = ndarray( new Uint8Array( width * height ), [ width, height ] )

    fill( tmp, fn )

    tmp.data.forEach( ( val, index ) => {
      this.data.data[ index + this.data.offset ] = val
    })

    // @TODO necessary?
    this.emit( 'update' )
  }

  rotateCW() {
    this.transform( ( y, x ) => {
      return this.data.get( x, this.data.shape[ 1 ] - 1 - y )
    })
  }
  rotateCCW() {
    this.transform( ( y, x ) => {
      return this.data.get( this.data.shape[ 0 ] - 1 - x, y )
    })
  }
  rotate180() {
    this.transform( ( y, x ) => {
      return this.data.get( this.data.shape[ 1 ] - 1 - y, this.data.shape[ 0 ] - 1 - x )
    })
  }

  translateX( amt ) {
    this.transform( ( y, x ) => {
      return this.data.get( x - amt, y )
    })
  }
  translateY( amt ) {
    this.transform( ( y, x ) => {
      return this.data.get( x, y - amt )
    })
  }
}

/**
 * Holds the entire map, i.e. all the sections
 */
class MapFormat extends EventEmitter {
  constructor( buffer ) {
    super()

    this.floor = new Raw( buffer, offsets[ 0 ], WIDTH - 1, HEIGHT - 1 )
    this.wallH = new Raw( buffer, offsets[ 1 ], WIDTH, HEIGHT )
    this.wallV = new Raw( buffer, offsets[ 2 ], WIDTH, HEIGHT )

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
 * Tile just holds floor data and handles ops on tiles
 * Currently hardcoded to the map format object
 */
class Tile {
  constructor( x, y ) {
    this.x = x
    this.y = y

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
      map.wallH.set( this.x, this.y, !map.wallH.get( this.x, this.y ) )
      return
    }
    if ( y > 1 - shield ) {
      map.wallH.set( this.x, this.y + 1, !map.wallH.get( this.x, this.y + 1 ) )
      return
    }
    if ( x < shield ) {
      map.wallV.set( this.x, this.y, !map.wallV.get( this.x, this.y ) )
      return
    }
    if ( x > 1 - shield ) {
      map.wallV.set( this.x + 1, this.y, !map.wallV.get( this.x + 1, this.y ) )
      return
    }


    this.type = !this.type
  }
}

/**
 * Create the working list of tiles
 */
class Tiles extends EventEmitter {
  constructor() {
    super()
    this.tiles = []
    for ( let y = 0; y < HEIGHT; y++ ) {
      for ( let x = 0; x < WIDTH; x++ ) {
        this.tiles.push( new Tile( x, y ) )
      }
    }

    // straight up, N, is 0
    // W1, S2, E3
    this.dir = 0
  }
  get( x, y ) {
    return this.tiles[ x + WIDTH * y ]
  }
  set( x, y, tile ) {
    this.tiles[ x + WIDTH * y ] = tile
  }

  /**
   * Rotates each facet of the map format
   */
  rotateCW() {
    map.floor.rotateCW()
    map.wallH.rotateCW()
    map.wallV.rotateCW()

    let temp = map.wallV
    map.wallV = map.wallH
    map.wallH = temp

    // Increment and wrap to 4 cardinals
    this.dir = this.dir + 1
    if ( this.dir === 4 ) {
      this.dir = 0
    }

    // Translate the extra buffer column as rotate fills it
    if ( this.dir === 1 ) {
      map.wallH.translateX( -1 )
    }
    if ( this.dir === 2 ) {
      map.wallH.translateX( -1 )
    }
    if ( this.dir === 3 ) {
      map.wallH.translateY( -1 )
    }
    if ( this.dir === 0 ) {
      map.wallH.translateY( -1 )
    }

    render()
  }
  /**
   * Rotates each facet of the map format
   */
  rotateCCW() {
    map.floor.rotateCCW()
    map.wallH.rotateCCW()
    map.wallV.rotateCCW()

    let temp = map.wallV
    map.wallV = map.wallH
    map.wallH = temp

    // decrement and wrap to 4 cardinals
    this.dir = this.dir - 1
    if ( this.dir < 0 ) {
      this.dir = 3
    }

    // Shift on east facing
    // if ( this.dir === 3 ) {
    //   map.wallV.translateX( -1 )
    //   map.wallH.translateX( -1 )
    // }
    //
    // // Do funky shift on west facing
    // if ( this.dir === 1 ) {
    //   map.wallV.translateY( -1 )
    //   map.wallH.translateY( -1 )
    // }
    if ( this.dir === 1 ) {
      map.wallH.translateX( -1 )
    }
    if ( this.dir === 2 ) {
      map.wallH.translateX( -1 )
    }
    if ( this.dir === 3 ) {
      map.wallH.translateY( -1 )
    }
    if ( this.dir === 0 ) {
      map.wallH.translateY( -1 )
    }

    render()
  }
}

var tiles = window.tiles = new Tiles()
tiles.on( 'update', () => render() )

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


function renderFloor( x, y ) {
  ctx.fillStyle = getColor( map.floor.get( x, y ) )
  ctx.fillRect( ( x * BLOCK_SIZE ), ( y * BLOCK_SIZE ), BLOCK_SIZE, BLOCK_SIZE )
}

function renderWalls( x, y ) {
  // if ( x < WIDTH - 1 ) {
  if ( x < WIDTH ) {
    ctx.strokeStyle = getColor( map.wallH.get( x, y ) ? 4 : 0 )
    ctx.beginPath()
    ctx.moveTo( x * BLOCK_SIZE, y * BLOCK_SIZE )
    ctx.lineTo( ( x + 1 ) * BLOCK_SIZE - 1, y * BLOCK_SIZE )
    ctx.stroke()
  }

  // if ( y < HEIGHT - 1 ) {
  if ( y < HEIGHT ) {
    ctx.strokeStyle = getColor( map.wallV.get( x, y ) ? 4 : 0 )
    ctx.beginPath()
    ctx.moveTo( x * BLOCK_SIZE, y * BLOCK_SIZE )
    ctx.lineTo( x * BLOCK_SIZE, ( y + 1 ) * BLOCK_SIZE - 1 )
    ctx.stroke()
  }
}

var dirEl = document.querySelector( '.js-dir' )

var render = function render() {
  //console.log( 'render' )
  ctx.clearRect( 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT )
  for ( var x = 0; x < WIDTH; x++ ) {
    for ( var y = 0; y < HEIGHT; y++ ) {
      if ( x < WIDTH - 1 && y < HEIGHT - 1 ) {
        renderFloor( x, y )
      }

      renderWalls( x, y )
    }
  }

  // Update direction indicator
  var dirs = [ 'North', 'East', 'South', 'West' ]
  dirEl.innerHTML = tiles.dir + ' ' + dirs[ tiles.dir ]
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
document.querySelector( '.js-rotcw' ).addEventListener( 'click', event => tiles.rotateCW() )
document.querySelector( '.js-rotccw' ).addEventListener( 'click', event => tiles.rotateCCW() )
// document.querySelector( '.js-rot180' ).addEventListener( 'click', event => rotate180() )
document.querySelector( '.js-logfloor' ).addEventListener( 'click', event => logdata( map.floor.data ) )
document.querySelector( '.js-logh' ).addEventListener( 'click', event => logdata( map.wallH.data ) )
document.querySelector( '.js-logv' ).addEventListener( 'click', event => logdata( map.wallV.data ) )
