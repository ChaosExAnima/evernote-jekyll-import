const Evernote = require( 'evernote' );
const Fetcher  = require( './fetcher' );
const fs       = require( 'fs-extra' );
const path     = require( 'path' );

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

	const notebook = 'Journal';

	const fetcher = new Fetcher( noteStore );
	fetcher.setup().then( () => {
		if ( fetcher.isSetup ) {
			const guid = fetcher.getNotebookGuidByName( notebook );
			if ( ! guid ) {
				throw new Error( `Could not find notebook: ${ notebook }` );
			}
			fetcher.getNotebookNotes( guid )
			.then( results => {
				return Promise.all( results.notes.map( async ({ content, title }) => {
					await fs.outputFile( path.resolve( __dirname, notebook, title + '.md' ), content );
				} ) );
			} );
		}
	} ).catch( err => {
		console.error( err );
	} );
}
