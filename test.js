const Evernote = require( 'evernote' );
const Fetcher  = require( './fetcher' );

require( 'dotenv' ).config();

main(); // Let's do this.

function main() {
	if ( ! process.env.TOKEN ) {
		throw new Error( 'No token defined!' );
	}
	const enClient = new Evernote.Client({
		token: process.env.TOKEN,
		sandbox: false,
		china: false
	});
	const noteStore = enClient.getNoteStore();

	const fetcher = new Fetcher( noteStore );
	fetcher.setup().then( () => {
		if ( fetcher.isSetup ) {
			fetcher.getNotebookNotes( '2df88f59-aa96-4c79-9b5e-471037d94400' )
			.then( r => r.notes.map( note => console.log( note ) ) );
			// fetcher.getNoteContent( '8fd2f97e-5cfe-44a2-b593-d0ede783dcf3' )
			// .then( content => {
			// 	console.log( content );
			// } );
		}
	} ).catch( err => {
		console.error( err );
	} );
}
