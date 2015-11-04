'use strict'

const WIDTH = 5
const HEIGHT = 5
const SIZE = 60

/**
 * Raw floor array data
 */
var floor = new Uint8Array( WIDTH * HEIGHT )

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
class WallData extends EventEmitter {
  constructor( width, height ) {
    super()
    this.width = width
    this.height = height

    // Create new data array and fill with 1's (solid)
    this.data = new Uint8Array( width * height )
    this.data.fill( 1, 0, width * height )

    this.on( 'update', render )
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
}

var wallH = new WallData( WIDTH, HEIGHT + 1 )
var wallV = new WallData( WIDTH + 1, HEIGHT )

var pos = [ 2, 2 ]

// console.log(
//   ' ',
//   get( wallH, pos[ 0 ] - 1, pos[ 1 ] - 1 ) ? '-' : ' ',
//   ' ',
//   get( wallH, pos[ 0 ]    , pos[ 1 ] - 1 ) ? '-' : ' ',
//   ' ',
//   get( wallH, pos[ 0 ] + 1, pos[ 1 ] - 1 ) ? '-' : ' '
// )
//
// console.log(
//   ' ',
//   ' ',
//   get( wallV, pos[ 0 ]    , pos[ 1 ] - 1 ) ? '|' : ' ',
//   ' ',
//   get( wallV, pos[ 0 ] + 1, pos[ 1 ] - 1 ) ? '|' : ' ',
//   ' ',
//   ' '
// )
//
// console.log(
//   ' ',
//   get( wallH, pos[ 0 ] - 1, pos[ 1 ] ) ? '—' : ' ',
//   ' ',
//   get( wallH, pos[ 0 ]    , pos[ 1 ] ) ? '—' : ' ',
//   ' ',
//   get( wallH, pos[ 0 ] + 1, pos[ 1 ] ) ? '—' : ' '
// )
//
// console.log(
//   ' ',
//   ' ',
//   get( wallV, pos[ 0 ]    , pos[ 1 ] ) ? '|' : ' ',
//   ' ',
//   get( wallV, pos[ 0 ] + 1, pos[ 1 ] ) ? '|' : ' ',
//   ' ',
//   ' '
// )

/**
 * Use functional lookup to keep this shizzle by reference
 */
class Walls {
  constructor( x, y ) {
    Object.defineProperties( this, {
      'N': {
        get: () => {
          return wallH.get( x, y )
        }
      },
      'E': {
        get: () => {
          return wallV.get( x + 1, y )
        }
      },
      'S': {
        get: () => {
          return wallH.get( x, y + 1 )
        }
      },
      'W': {
        get: () => {
          return wallV.get( x, y )
        }
      }
    })
  }
}
/**
 * Use floor array to hold an object representing the tile, with
 * wall segments as pointers
 */
class Tile {
  constructor( bit, x, y ) {
    this.type = bit
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
  }
}

var tiles = []
for ( let y = 0; y < HEIGHT; y++ ) {
  for ( let x = 0; x < WIDTH; x++ ) {
    console.log( 'generating', x, y )
    tiles.push( new Tile( 0, x, y ) )
  }
}

// So, tiles[ 0 ].walls should all be 1 as all the wall arrays were
// initialised to 1, cant tell yet whether its correct or not though
console.log( '\n', '- Before manipulating the wall array' )
console.log( tiles[ 0 ] )

// Manip first horizontal wall, which should be N for the tile
wallH[ 0 ] = 2
console.log( '\n', '- After manipulating the wall array' )
console.log( tiles[ 0 ] )

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
  li.style[ 'border-top' ] = tile.walls.N ? '1px solid #34d4d8' : ''
  li.style[ 'border-right' ] = tile.walls.E ? '1px solid #34d4d8' : ''
  li.style[ 'border-bottom' ] = tile.walls.S ? '1px solid #34d4d8' : ''
  li.style[ 'border-left' ] = tile.walls.W ? '1px solid #34d4d8' : ''
  ul.appendChild( li )
}

function render() {
  ul.innerHTML = null
  tiles.forEach( renderTile )
}

render()
