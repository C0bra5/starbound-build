'use babel';

import { EventEmitter } from 'events';

export default class ErrorMatcher extends EventEmitter {

	constructor() {
		super();
		this.regex = null;
		this.cwd = null;
		this.stdout = null;
		this.stderr = null;
		this.currentMatch = [];
		this.firstMatchId = null;

		atom.commands.add('atom-workspace', 'starbound-build:error-match', ::this.match);
		atom.commands.add('atom-workspace', 'starbound-build:error-match-first', ::this.matchFirst);
	}

	_gotoNext() {
		if (0 === this.currentMatch.length) {
			return;
		}

		this.goto(this.currentMatch[0].id);
	}

	goto(id) {
		const match = this.currentMatch.find(m => m.id === id);
		if (!match) {
			this.emit('error', 'Can\'t find match with id ' + id);
			return;
		}

		// rotate to next match
		while (this.currentMatch[0] !== match) {
			this.currentMatch.push(this.currentMatch.shift());
		}
		this.currentMatch.push(this.currentMatch.shift());

		let file = match.file;
		if (!file) {
			this.emit('error', 'Did not match any file. Don\'t know what to open.');
			return;
		}

		const fs = require('fs');
		let found = fs.existsSync(file);

		if (!found) {
			// the file path might not be absolute
			let path = require('path');
			let isAbsolute;
			if (process.platform === "win32") {
				isAbsolute =
					file.match(/^[a-zA-Z]\:\\/) ||
					file.match(/^\\\\/);
			} else {
				isAbsolute = path.isAbsolute(file);
			}

			const absolutedPath = isAbsolute ? file : path.join(this.cwd, file)
			// points to patch file
			if (fs.existsSync(absolutedPath)) {
				file = absolutedPath
				found = true;
			} else if (fs.existsSync(absolutedPath + ".patch")) {
				file = absolutedPath + ".patch";
				found = true;
			} else if (!isAbsolute) {
				// in case they have their project hooked to the mods folder
				// do a check as if all mods were the current cwd
				let dirents = fs.readdirSync(this.cwd)
					.filter(x => !x.startsWith("_")) // filter out dissabled mods
					.map(x => path.join(this.cwd, x)) // make paths absolute
					.filter(x => fs.statSync(x).isDirectory()) // filter out non-directories
				
				// look for the file or it's patch in the cwd
				for (let subDir of dirents) {
					if (fs.existsSync(subFile)) {
						file = subDir;
						found = true;
						break;
					}
					if (fs.existsSync(subFile + ".patch")) {
						file = subDir + ".patch";
						found = true;
						break;
					}
				}
			}
		}
		
		if (found) {
			// calculating the lines 
			const row = match.line ? match.line - 1 : 0; /* Because atom is zero-based */
			const col = match.col ? match.col - 1 : 0; /* Because atom is zero-based */
			
			// open the file if found
			atom.workspace.open(file, {
				initialLine: row,
				initialColumn: col,
				searchAllPanes: true
			});
			this.emit('matched', match);
		} else {
			this.emit('error', 'Matched file does not exist: ' + file);
			return;
		}
		
	}

	_parse() {
		this.currentMatch = [];

		// first run all functional matches
		this.functions && this.functions.forEach((f, functionIndex) => {
			this.currentMatch = this.currentMatch.concat(f(this.output).map((match, matchIndex) => {
				match.id = 'error-match-function-' + functionIndex + '-' + matchIndex;
				match.type = match.type || 'Error';
				return match;
			}));
		});
		// then for all match kinds
		Object.keys(this.regex).forEach(kind => {
			// run all matches
			this.regex[kind] && this.regex[kind].forEach((regex, i) => {
				regex && require('xregexp').forEach(this.output, regex, (match, matchIndex) => {
					match.id = 'error-match-' + i + '-' + matchIndex;
					match.type = kind;
					this.currentMatch.push(match);
				});
			});
		});

		this.currentMatch.sort((a, b) => a.index - b.index);

		this.firstMatchId = (this.currentMatch.length > 0) ? this.currentMatch[0].id : null;
	}

	_prepareRegex(regex) {
		regex = regex || [];
		regex = (regex instanceof Array) ? regex : [ regex ];

		return regex.map(r => {
			try {
				const XRegExp = require('xregexp');
				return XRegExp(r);
			} catch (err) {
				this.emit('error', 'Error parsing regex. ' + err.message);
				return null;
			}
		});
	}

	set(target, cwd, output) {
		this.regex = {
			Error: this._prepareRegex([
				"\\[Error\\] Exception caught loading asset:([^\\n]|\\n):([^\\n]|\\n)(?=Caused by.*? json file)Caused by.*? json file: (?<file>.*)([^\\n]|\\n)*?(?=Caused by)(?<message>([^\\n]|\\n)*?(?= at [0-9]+\\:[0-9]+) at (?<line>[0-9]+)\\:(?<col>[0-9]+))",
				"\\[Error\\](?<message>[^\\r\\n]+?\\(LuaException\\) Error code 2[^\"]+\"(?<file>[^\"]+)\"]:(?<line>\\d+):[^\\n]+)",
				"\\[Error\\][^\\n]+?(?<message>\\(ItemException\\)[^\n]+)",
				"\\[Error\\] (?<message>Could not load image asset([^\\n]|\\n)*?\\(AssetException\\) No such asset[^\n]+)",
				"\\[Error\\] (?<message>Could not load image asset([^\\n]|\\n)*?\\(AssetException\\) No associated frames file found for image[^\n]+)"
			]),
			Warning: this._prepareRegex(null)
		};

		this.cwd = cwd;
		this.output = output;
		this.currentMatch = [];

		this._parse();
	}

	match() {
		require('./google-analytics').sendEvent('errorMatch', 'match');

		this._gotoNext();
	}

	matchFirst() {
		require('./google-analytics').sendEvent('errorMatch', 'first');

		if (this.firstMatchId) {
			this.goto(this.firstMatchId);
		}
	}

	hasMatch() {
		return 0 !== this.currentMatch.length;
	}

	getMatches() {
		return this.currentMatch;
	}
}
