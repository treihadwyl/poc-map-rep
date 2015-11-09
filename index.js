
import EventEmitter from 'eventemitter3'

import ndarray from 'ndarray'
import unpack from 'ndarray-unpack'
import fill from 'ndarray-fill'
import rotate from 'rotate-array'

import leveljs from 'level-js'
import levelup from 'levelup'
import promisify from 'level-promisify'

const WIDTH = window.WIDTH = 2
const HEIGHT = window.HEIGHT = 2

const CANVAS_WIDTH = 640
const CANVAS_HEIGHT = 480
const BLOCK_SIZE = 100

var canvas = document.querySelector( '.canvas' )
var ctx = window.ctx = canvas.getContext( '2d' )

/**
 * This version extends the underlying grid to 4x4 sections which each 4x4 matrix
 * representing one grid tile, with a redundant entry (which could be used for
 * something else).
 * 0, 0,
 * 1, 0
 * blank, wallH,
 * wallV, tile
 * This complicates a few bits and pieces but not by much and means somethings
 * like taking slices out of the array are still easy enough, but, crucially, this
 * massively simplifies rotation which is very handy for later rendering of
 * map portions/slices.
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

/**
 * Each group of 4 represents one tile
 * 0, 0
 * 0, 0
 * blank, wallH,
 * wallV, tile
 */
var byteLength = ( WIDTH * 2 + 1 ) * ( HEIGHT * 2 + 1 )

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

    this.data = new Raw( buffer, 0, WIDTH * 2 + 1, HEIGHT * 2 + 1 )

    this.data.on( 'update', () => render() )

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

    //@TODO cache translations here, they are used again inside render
    Object.defineProperty( this, 'type', {
      get: function() {
        return map.data.get( x * 2 + 1, y * 2 + 1 )
      },
      set: function( value ) {
        map.data.set( x * 2 + 1, y * 2 + 1, value )
      }
    })
  }


  render() {
    console.log( 'rendering', this.x, this.y )
    // Translate to global map buffer coords for a tile
    let x = this.x * 2 + 1
    let y = this.y * 2 + 1

    // Render floor
    ctx.fillStyle = getColor( map.data.get( x, y ) )
    ctx.fillRect( ( this.x * BLOCK_SIZE ), ( this.y * BLOCK_SIZE ), BLOCK_SIZE, BLOCK_SIZE )

    // Render top wall
    ctx.strokeStyle = getColor( map.data.get( x, y - 1 ) ? 4 : 0 )
    ctx.beginPath()
    ctx.moveTo( this.x * BLOCK_SIZE, this.y * BLOCK_SIZE )
    ctx.lineTo( ( this.x + 1 ) * BLOCK_SIZE - 1, this.y * BLOCK_SIZE )
    ctx.stroke()

    // Render left wall
    ctx.strokeStyle = getColor( map.data.get( x - 1, y ) ? 4 : 0 )
    ctx.beginPath()
    ctx.moveTo( this.x * BLOCK_SIZE, this.y * BLOCK_SIZE )
    ctx.lineTo( this.x * BLOCK_SIZE, ( this.y + 1 ) * BLOCK_SIZE )
    ctx.stroke()

    // If we're at the bottom or right edge then extra one needs to be rendered
    if ( y === HEIGHT + 1 ) {
      ctx.strokeStyle = getColor( map.data.get( x, y + 1 ) ? 4 : 0 )
      ctx.beginPath()
      ctx.moveTo( this.x * BLOCK_SIZE, ( this.y + 1 ) * BLOCK_SIZE )
      ctx.lineTo( ( this.x + 1 ) * BLOCK_SIZE - 1, ( this.y + 1 ) * BLOCK_SIZE )
      ctx.stroke()
    }

    if ( x === WIDTH + 1 ) {
      ctx.strokeStyle = getColor( map.data.get( x + 1, y ) ? 4 : 0 )
      ctx.beginPath()
      ctx.moveTo( ( this.x + 1 ) * BLOCK_SIZE, this.y * BLOCK_SIZE )
      ctx.lineTo( ( this.x + 1 ) * BLOCK_SIZE, ( this.y + 1 ) * BLOCK_SIZE )
      ctx.stroke()
    }
  }

  /**
   * Currently expects x and y clamped 0...1, 0,0 is TL, 1,1 is BR
   */
  onClick( tilex, tiley ) {
    let shield = .15
    let x = this.x * 2 + 1
    let y = this.y * 2 + 1

    if ( tiley < shield ) {
      map.data.set( x, y - 1, !map.data.get( x, y - 1 ) )
      return
    }
    if ( tiley > 1 - shield ) {
      map.data.set( x, y + 1, !map.data.get( x, y + 1 ) )
      return
    }
    if ( tilex < shield ) {
      map.data.set( x - 1, y, !map.data.get( x - 1, y ) )
      return
    }
    if ( tilex > 1 - shield ) {
      map.data.set( x + 1, y, !map.data.get( x + 1, y ) )
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

  switchDim() {
    let temp = map.wallV
    map.wallV = map.wallH
    map.wallH = temp
  }

  /**
   * Rotates each facet of the map format
   */
  rotateCW() {
    map.data.rotateCW()

    // Increment and wrap to 4 cardinals
    this.dir = this.dir + 1
    if ( this.dir === 4 ) {
      this.dir = 0
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
    // if ( this.dir === 1 ) {
    //   map.wallV.translateX( -1 )
    // }
    // if ( this.dir === 2 ) {
    //   map.wallV.translateY( -1 )
    // }
    // if ( this.dir === 3 ) {
    //   map.wallV.translateY( -1 )
    // }
    // if ( this.dir === 0 ) {
    //   map.wallV.translateY( -1 )
    // }

    render()
  }
}

var tiles = window.tiles = new Tiles()
tiles.on( 'update', () => render() )



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
function renderTile( x, y ) {

}

var dirEl = document.querySelector( '.js-dir' )

var render = function render() {
  //console.log( 'render' )
  ctx.clearRect( 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT )
  for ( var x = 0; x < WIDTH; x++ ) {
    for ( var y = 0; y < HEIGHT; y++ ) {
      // Use the tile, which is always at 1,1 of the 4 by 4 chunk, i.e.
      // its on all the odd numbered rows/cols
      // if ( x % 2 && y % 2 ) {
      //   console.log( 'rendering' )
      //   renderTile( x, y )
      // }
      tiles.get( x, y ).render()
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



// for now fill the view
// view.fill( 1 )
// map.wallH.set( 0, 1, 1 )
