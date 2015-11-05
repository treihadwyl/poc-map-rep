
var canvas = document.querySelector( '.canvas' )
var ctx = window.ctx = canvas.getContext( '2d' )
const CANVAS_WIDTH = 640
const CANVAS_HEIGHT = 480
const BLOCK_SIZE = 50

var ndarray = window.ndarray = require( 'ndarray' )
var imageRotate = window.imageRotate = require( 'image-rotate' )
var zeros = window.zeros = require( 'zeros' )

var lena = window.lena = require( 'lena' )
var luminance = window.luminance = require( 'luminance' )
var warp = window.warp = require( 'ndarray-warp' )
var unpack = window.unpack = require( 'ndarray-unpack' )
var cwise = window.cwise = require( 'cwise' )
var fill = window.fill = require( 'ndarray-fill' )

const WIDTH = window.WIDTH = 2
const HEIGHT = window.HEIGHT = 2

// Source of truth - underlying data store
//var buf = window.buf = new ArrayBuffer( WIDTH * HEIGHT * 2 )
var buf = window.buf = new ArrayBuffer( WIDTH * HEIGHT )

// Just a view on to the data
var view = window.view = new Uint8Array( buf )
view.fill( 0 )

// Uses the view to access the buffer
var arr = window.arr = ndarray( view, [ WIDTH, HEIGHT ] )

// arr.set( 0, 0, 1 )
// arr.set( 1, 0, 2 )
// arr.set( 2, 0, 3 )
// arr.set( 3, 0, 4 )
var index = 0
fill( arr, ( x, y ) => {
  return arr.shape[ 0 ] * y + x
})

// Checking that a everyone is actually just manipulating the buffer
var view2 = window.view2 = new Uint8Array( buf )
console.log( 0, ':', view2 )

// As the array buffer is long enough to contain 2 arrays this should work
//var arr2 = ndarray( view, [ WIDTH, HEIGHT ], [ WIDTH, 1 ], WIDTH * HEIGHT )
// and it does, just fine. note that param 3 is the stride, 4,1 is default which
// means the first 4 items in the buffer represent a 'column' of data, 1,4 changes
// it to represent a row.


/**
 * Test rotating this bad boy
 */
var res = window.res = ndarray( new Uint8Array( WIDTH * HEIGHT ), [ WIDTH, HEIGHT ] )
function rotate( angle ) {
  // var res = zeros([ WIDTH, HEIGHT ], 'uint8' )
  // imageRotate( res, arr, angle )
  // console.log( res )
  // window.res = res
  imageRotate( arr, arr, angle )
  render()
}
window.rotate = rotate


/**
 * Uses ndarray-warp to do stuff
 */
// window.transform = function transform( fn ) {
//   fn = fn || function func( o, i ) {
//     o[ 0 ] = i[ 1 ]
//     o[ 1 ] = i[ 0 ]
//   }
//
//   warp( res, arr, fn )
//
//   // now update array data, warp( arr, arr, fn ) does not work as it mutates arr
//   // during the function
//   // @TODO this needs to be a copy, as arr no longer refs buf after this
//   //arr.data = res.data
//   res.data.forEach( ( val, index ) => {
//     arr.data[ index ] = val
//   })
//   render()
//   logdata( arr )
// }

/**
 * Rotates arr 90 CW
 */
window.transform = function transform( fn ) {
  fn = fn || function iterate( y, x ) {
    return arr.get( x, arr.shape[ 1 ] - 1 - y )
  }

  fill( res, fn )

  res.data.forEach( ( val, index ) => {
    arr.data[ index ] = val
  })
  render()
  logdata( arr )
}

/**
 * go bareback with cwise
 */
var mutate = window.mutate = cwise({
  args: [ 'array', { blockIndices: 2 } ],
  body: function( a, b ) {
    console.log( a )
    console.log( b )
    a = b
  }
})

/**
 * logs the array in 2d
 * transforms from row major to cartesian
 */
window.logdata = function logdata( nda ) {
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

window.render = function render() {
  ctx.clearRect( 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT )
  // arr.shape[ 0 ] === width, but why hold on to width when the ndarray
  // holds its shape anyway
  for ( var x = 0; x < arr.shape[ 0 ]; x++ ) {
    for ( var y = 0; y < arr.shape[ 1 ]; y++ ) {
      ctx.fillStyle = getColor( arr.get( x, y ) )
      ctx.fillRect( x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE * .9, BLOCK_SIZE * .9 )
    }
  }
}

render()
