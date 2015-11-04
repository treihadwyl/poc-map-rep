
import EventEmitter from 'eventemitter3'

import leveljs from 'level-js'
import levelup from 'levelup'
import promisify from 'level-promisify'

let raw = levelup( 'TRmap', {
  db: leveljs,
  valueEncoding: 'binary'
})

let db = promisify( raw )

const WIDTH = 10
const HEIGHT = 10
const SIZE = 50

/**
 * Raw floor array data
 */
// var floorData = new Uint8Array( WIDTH * HEIGHT )

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
 * Holds the map of wall data and its getter/setter
 */
class Raw extends EventEmitter {
  constructor( buffer, offset, width, height ) {
    super()
    this.width = width
    this.height = height

    // Create new data array and fill with 1's (solid)
    this.data = new Uint8Array( buffer, offset, width * height )
    this.data.fill( 1, 0, width * height )
  }

  get( x, y ) {
    x = clamp( x, 0, this.width )
    y = clamp( y, 0, this.height )
    return this.data[ ( y * this.width ) + x ]
  }

  set( x, y, value ) {
    if ( !checkBounds( x, 0, this.width ) || !checkBounds( y, 0, this.height ) ) {
      throw new Error( 'out of bounds' )
    }
    this.data[ y * this.width + x ] = value
    this.emit( 'update' )
  }

  fill( value ) {
    this.data.fill( value, 0, this.width * this.height )
  }

  get length() {
    return this.data.length
  }
}


class MapFormat extends EventEmitter {
  constructor() {
    super()

    // Based on height-width create a buffer to hold all the data
    this.buf = new ArrayBuffer(
      ( WIDTH * HEIGHT ) +
      ( WIDTH * ( HEIGHT + 1 ) ) +
      ( ( WIDTH + 1 ) * HEIGHT )
    )

    // Create raw buffers to hold different bits of data,
    // also supply offsets to the main buffer data
    this.floor = new Raw( this.buf, 0, WIDTH, HEIGHT )
    this.wallH = new Raw( this.buf, ( WIDTH * HEIGHT ), WIDTH, HEIGHT + 1 )
    this.wallV = new Raw( this.buf, ( WIDTH * HEIGHT ) + ( WIDTH * ( HEIGHT + 1 ) ), WIDTH + 1, HEIGHT )

    // Add event listeners for the data views
    // For POC just re-render anything on any update
    this.floor.on( 'update', render )
    this.wallH.on( 'update', render )
    this.wallV.on( 'update', render )

    // save key for stuffing into local storage
    // @TODO indexeddb should be able to handle the binary
    this.saveKey = 'tr_map'
  }

  saveLS() {
    var total = new Uint8Array( this.buf )
    var data = btoa( String.fromCharCode.apply( null, total ) )

    // @TODO could do basic compression, eg AAAAA = 5A

    localStorage.setItem( this.saveKey, data )
    console.log( 'map saved to local storage' )

    return data
  }

  loadLS( format ) {
    let data = format || localStorage.getItem( this.saveKey )

    let decoded = atob( data )
      .split( '' )
      .map( c => c.charCodeAt( 0 ) )

    let total = new Uint8Array( this.buf )

    // Copy over @TODO best way?
    decoded.forEach( ( char, index ) => {
      total[ index ] = char
    })

    console.log( 'map loaded' )
    this.emit( 'update' )
    return decoded
  }

  save() {
    // Stuff raw binary map data into idb
    db.put( this.saveKey, this.buf )
      .then( () => {
        console.log( 'map saved to database' )
      })
      .catch( err => {
        console.error( 'Error saving to idb' )
        console.error( err )
      })
  }

  load( format ) {
    db.get( this.saveKey )
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

var map = new MapFormat()

// For POC just re-render when the data changes
map.on( 'update', render )

/**
 * Use functional lookup to keep this shizzle by reference
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
    // This creates a new array, does not pass by reference
    // this.walls = new Uint8Array([
    //   get( wallH, x, y ), // N
    //   get( wallV, x + 1, y ), // E
    //   get( wallH, x, y + 1 ), // S
    //   get( wallV, x, y ), // W
    // ])

    // Doesnt work either, still by value
    // this.temp = wallH[ 0 ]

    // Certainly does work of course, although ugly
    // Object.defineProperty( this, 'wallN', {
    //   get: function() {
    //     return get( wallH, x, y )
    //   }
    // })

    // More nope
    // this.w = []
    // this.w.push( get( wallH, x, y ) )

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

var tiles = []
for ( let y = 0; y < HEIGHT; y++ ) {
  for ( let x = 0; x < WIDTH; x++ ) {
    //console.log( 'generating', x, y )
    tiles.push( new Tile( x, y ) )
  }
}

/**
 * Setup the rendering
 */
var borderColor = 'rgb( 78, 74, 78 )'
var solidColor = 'rgb( 117, 113, 97 )'

var ul = document.createElement( 'ul' )
Object.assign( ul.style, {
  width: SIZE * WIDTH + 'px',
  height: SIZE * HEIGHT + 'px',
  position: 'absolute',
  top: '20px',
  left: '20px',
  // border: '1px solid #acacac',
  'list-style-type': 'none',
  padding: 0
})
document.body.appendChild( ul )

function renderTile( tile ) {
  var li = document.createElement( 'li' )
  Object.assign( li.style, {
    float: 'left',
    width: SIZE + 'px',
    height: SIZE + 'px',
    'box-sizing': 'border-box'
  })
  li.style[ 'border-top' ] = tile.walls.N ? '1px solid ' + borderColor : ''
  li.style[ 'border-right' ] = tile.walls.E ? '1px solid ' + borderColor : ''
  li.style[ 'border-bottom' ] = tile.walls.S ? '1px solid ' + borderColor : ''
  li.style[ 'border-left' ] = tile.walls.W ? '1px solid ' + borderColor : ''
  li.style[ 'background' ] = tile.type ? solidColor : ''
  ul.appendChild( li )

  li.addEventListener( 'click', event => {
    // console.log( event.offsetX, event.offsetY )

    // Check if mouse is at the top, which would denote changing the N wall
    // Use 20% of size as a bound
    if ( event.offsetY < SIZE * .2 ) {
      tile.walls.N = !tile.walls.N
      return
    }
    if ( event.offsetY > SIZE * .8 ) {
      tile.walls.S = !tile.walls.S
      return
    }
    if ( event.offsetX < SIZE * .2 ) {
      tile.walls.W = !tile.walls.W
      return
    }
    if ( event.offsetX > SIZE * .8 ) {
      tile.walls.E = !tile.walls.E
      return
    }

    tile.type = !tile.type

    // If setting the whole tile then quickly set all the walls
    //tile.walls.fill( tile.type )
    // Actually, from a user viewpoint this is all a bit funky, needs work
  })
}

function render() {
  //console.log( 'render' )
  ul.innerHTML = null
  tiles.forEach( renderTile )
}

render()


/**
 * Add event listeners to the DOM elements
 */
document.querySelector( '.js-save' ).addEventListener( 'click', event => map.save() )
document.querySelector( '.js-load' ).addEventListener( 'click', event => map.load() )
