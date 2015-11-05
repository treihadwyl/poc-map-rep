
var canvas = document.querySelector( '.canvas' )
var ctx = window.ctx = canvas.getContext( '2d' )
const CANVAS_WIDTH = 640
const CANVAS_HEIGHT = 480
const BLOCK_SIZE = 50

var ndarray = window.ndarray = require( 'ndarray' )

const WIDTH = window.WIDTH = 4
const HEIGHT = window.HEIGHT = 4

var buf = window.buf = new ArrayBuffer( WIDTH * HEIGHT )
var view = window.view = new Uint8Array( buf )
view.fill( 1 )

var arr = window.arr = ndarray( view, [ WIDTH, HEIGHT ] )

arr.set( 0, 0, 0 )
arr.set( 0, 1, 0 )

var view2 = window.view2 = new Uint8Array( buf )

console.log( 0, ':', view2 )



function render() {
  ctx.clearRect( 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT )
  // arr.shape[ 0 ] === width, but why hold on to width when the ndarray
  // holds its shape anyway
  for ( var x = 0; x < arr.shape[ 0 ]; x++ ) {
    for ( var y = 0; y < arr.shape[ 1 ]; y++ ) {
      ctx.fillStyle = arr.get( x, y ) ? 'rgb( 117, 113, 97 )' : 'rgb( 78, 74, 78 )'
      ctx.fillRect( x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE * .9, BLOCK_SIZE * .9 )
    }
  }
}

render()

window.render = render
