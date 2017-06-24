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

		const path = require('path');
		if (!path.isAbsolute(file)) {
			file = this.cwd + path.sep + file;
		}

		const row = match.line ? match.line - 1 : 0; /* Because atom is zero-based */
		const col = match.col ? match.col - 1 : 0; /* Because atom is zero-based */

		require('fs').exists(file, (exists) => {
			if (!exists) {
				if (this.cwd.startsWith("C:\\Program Files (x86)\\Steam\\SteamApps\\common\\Starbound")) {
					if (require('fs').existsSync(this.cwd + file + ".patch")) {
						file = this.cwd + file + ".patch";
						match.file = file;
					} else {
						this.emit('error', 'Matched file does not exist: ' + file);
						return;
					}
				} else {
					this.emit('error', 'Matched file does not exist: ' + file);
					return;
				}
			}
			atom.workspace.open(file, {
				initialLine: row,
				initialColumn: col,
				searchAllPanes: true
			});
			this.emit('matched', match);
		});
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
				"\\[Error\\] Exception caught loading asset:([^\\n]|\\n)*?(?=Caused by.*? json file)Caused by.*? json file: (?<file>.*)([^\\n]|\\n)*?(?=Caused by)(?<message>([^\\n]|\\n)*?(?= at [0-9]+\\:[0-9]+) at (?<line>[0-9]+)\\:(?<col>[0-9]+))",
				"\\[Error\\](?<message>[^\\r\\n]+?\\(LuaException\\) Error code 2[^\"]+\"(?<file>[^\"]+)\"]:(?<line>\\d+):[^\\n]+)",
				"\\[Error\\][^\\n]+?(?<message>\\(ItemException\\)[^\n]+)"
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
