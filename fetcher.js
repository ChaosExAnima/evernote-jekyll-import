const TurndownService = require( 'turndown' );
const fs              = require( 'fs-extra' );
const path            = require( 'path' );

class Fetcher {
	constructor( store ) {
		this.noteStore = store;
		this.turndown  = new TurndownService();
		this.isSetup   = false;
		this.notebooks = new Map();
		this.tags      = new Map();
	}

	async setup() {
		const notebooks = await this.getAllNotebooks();
		const tags      = await this.getAllTags();

		if ( ! notebooks || ! tags ) {
			return;
		}

		notebooks.forEach( n => this.notebooks.set( n.guid, n.name ) );
		tags.forEach( t => this.tags.set( t.guid, t.name ) );

		this.isSetup = true;
	}

	async getAllNotebooks() {
		try {
			return await this.noteStore.listNotebooks();
		} catch ( err ) {
			return this.handleError( err );
		}
	}

	async getAllTags() {
		try {
			return await this.noteStore.listTags();
		} catch ( err ) {
			return this.handleError( err );
		}
	}

	async getNotebookNotes( notebook, offset = 0 ) {
		if ( ! this.isSetup || ! this.notebooks.has( notebook ) ) {
			return;
		}

		try {
			const results = await this.noteStore.findNotesMetadata( {
				notebookGuid: notebook
			}, offset, 250, { includeTitle: true } );

			const notes = await Promise.all(
				results.notes.map( async ({ guid, title }) => {
					const content = await this.getNoteContent( guid );
					{
						title,
						content
					}
				} )
			);

			return {
				notes,
				total: results.totalNotes
			};
		} catch ( err ) {
			return this.handleError( err );
		}
	}

	async getNoteContent( guid ) {
		if ( ! this.isSetup ) {
			console.error( 'Fetcher is not set up yet!' );
			return '';
		}
		let note = {};
		try {
			note = await this.getNoteByGuid( guid );
		} catch ( err ) {
			return this.handleError( err );
		}
		const content = this.turndown.turndown( note.content )
		.replace( /^\s*[\r\n]/gm, '\n' )
		.replace( /[\t ]+$/gm, '' );
		const file = this.attributesToHeader( note ) + '\n' + content;

		return file;
	}

	async getNoteByGuid( guid ) {
		const cacheFile = path.resolve( __dirname, '.cache', guid );
		let note;
		try {
			note = await fs.readJson( cacheFile );
		} catch ( err ) {}

		if ( note ) {
			return note;
		}

		try {
			note = await this.noteStore.getNoteWithResultSpec( guid, {
				includeContent: true,
				includeResourcesData: true
			} );
			await fs.writeJson( cacheFile, note );
		} catch ( err ) {
			this.handleError( err );
		}
		return note;
	}

	handleError( error ) {
		if ( error.rateLimitDuration ) {
			const duration = error.rateLimitDuration;
			const minutes  = Math.ceil( duration / 60 );
			console.error( `API limited, please wait approximately ${ minutes } minutes.` );
		} else {
			console.error( error );
		}
		return false;
	}

	attributesToHeader( note ) {
		const { attributes, title, guid, tagGuids, notebookGuid } = note;

		let header = [ '---' ];
		header.push( `title: ${ title }` );
		header.push( `author: ${ attributes.author }` );
		if ( attributes.sourceURL ) {
			header.push( `url: ${ attributes.sourceURL }` );
		}
		if ( tagGuids && tagGuids.length ) {
			header.push( 'tags:' );
			header.concat( tagGuids.map( t => ` - ${ this.tags.get( t ) }` ) );
		}
		if ( notebookGuid && this.notebooks.has( notebookGuid ) ) {
			header.push( `notebook: ${ this.notebooks.get( notebookGuid ) }` );
		}
		header.push( `guid: ${ guid }` );
		header.push( '---' );
		return header.join( '\n' );
	}
}

module.exports = Fetcher;
