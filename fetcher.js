const TurndownService = require( 'turndown' );
const fs              = require( 'fs-extra' );
const path            = require( 'path' );
const format          = require( 'date-fns/format' );

class Fetcher {
	constructor( store ) {
		this.noteStore = store;
		this.turndown  = new TurndownService();
		this.isSetup   = false;
		this.notebooks = new Map();
		this.tags      = new Map();
	}

	async setup() {
		const statePath = path.resolve( __dirname, '.state' );
		let localState = 0, remoteState;
		try {
			[ remoteState, localState ] = await Promise.all( [
				this.noteStore.getSyncState(),
				fs.readFile( statePath, { encoding: 'utf-8' } )
			] );
		} catch ( err ) {
			this.handleError( err );
		}

		if (
			parseInt( localState, 10 ) === remoteState.updateCount
		) {
			throw new Error( 'Local state is the same.' );
		}

		await fs.writeFile( statePath, remoteState.updateCount );

		try {
			const [ notebooks, tags ] = await Promise.all( [
				this.noteStore.listNotebooks(),
				this.noteStore.listTags()
			] );
			notebooks.forEach( n => this.notebooks.set( n.guid, n.name ) );
			tags.forEach( t => this.tags.set( t.guid, t.name ) );
		} catch ( err ) {
			this.handleError( err );
		}

		if ( ! this.notebooks.size ) {
			throw new Error( 'Could not get notebooks.' );
		}

		this.isSetup = true;
	}

	getNotebookGuidByName( name ) {
		for ( let [ key, val ] of this.notebooks.entries() ) {
			if ( val.toLowerCase() === name.toLowerCase() ) {
				return key;
			}
		}
		return null;
	}

	async getNotebookNotes( notebook, offset = 0 ) {
		if ( ! this.isSetup || ! this.notebooks.has( notebook ) ) {
			throw new Error( 'Not set up' );
		}

		try {
			const results = await this.noteStore.findNotesMetadata( {
				notebookGuid: notebook
			}, offset, 250, { includeTitle: true } );

			const notes = await Promise.all(
				results.notes.map( async ({ guid, title }) => {
					const content = await this.getNoteContent( guid );
					return {
						title: title.replace( /[^0-9a-z]/gi, '-' ).toLowerCase(),
						content
					};
				} )
			);

			return {
				notes,
				total: results.totalNotes
			};
		} catch ( err ) {
			this.handleError( err );
		}
	}

	async getNoteContent( guid ) {
		if ( ! this.isSetup ) {
			throw new Error( 'Not set up' );
		}
		let note = {};
		try {
			note = await this.getNoteByGuid( guid );
		} catch ( err ) {
			this.handleError( err );
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
		} catch ( err ) {} // We don't care if we don't have the file.

		if ( note ) {
			return note;
		}

		try {
			note = await this.noteStore.getNoteWithResultSpec( guid, {
				includeContent: true,
				includeResourcesData: true
			} );
			await fs.writeJson( cacheFile, { cacheTime: Date.now(), ...note } );
		} catch ( err ) {
			this.handleError( err );
		}
		return note;
	}

	handleError( error ) {
		if ( error.rateLimitDuration ) {
			const duration = error.rateLimitDuration;
			const minutes  = Math.ceil( duration / 60 );
			throw new Error( `API limited, please wait approximately ${ minutes } minutes.` );
		} else {
			throw error;
		}
	}

	attributesToHeader( note ) {
		const {
			attributes,
			title,
			guid,
			tagGuids,
			notebookGuid,
			created,
			updated
		} = note;

		const date = ts => format(
			new Date( ts ),
			'YYYY-MM-DD H:MM:SS'
		);

		let header = [ '---' ];
		header.push( `title: ${ title }` );
		if ( attributes.author ) {
			header.push( `author: ${ attributes.author }` );
		}
		if ( created ) {
			header.push( `date: ${ date( created ) }` );
		}
		if ( updated && updated !== created ) {
			header.push( `updated: ${ date( updated ) }` );
		}
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
