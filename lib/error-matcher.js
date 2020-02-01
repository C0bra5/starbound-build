'use babel';

import { EventEmitter } from 'events';
const path = require('path');
const fs = require('fs');

let ErrorLevel = {
	error : "Error",
	warning : "Warning",
	info : "Information",
	debug : "Debug"
}
let ErrorType = {
	regex : 1
}

class IdentifiedError {
	constructor(errorDescriptor, errorData, index) {
		this.descriptor = errorDescriptor;
		this.data = errorData;
		this.id = 'starbound-build-error-' + this.data.name + '-' + index;
	}
	
	setErrorText(errorText) {
		this.errorText = errorText;
	}
	
	setFile(file, fileFound) {
		this.file = file;
		this.fileFound = fileFound;
	}
	
	setColumn(column) {
		this.column = column;
	}
	
	setLine(line) {
		this.line = line;
	}
	
	setMessage(message) {
		this.message = message;
	}
	
	setSeverity(severity) {
		this.severity = severity;
	}
}

export default class ErrorMatcher extends EventEmitter {

	constructor() {
		super();
		this.errorRegistery = [
			{
				name : "luaException",
				severity : ErrorLevel.error,
				type : ErrorType.regex,
				couldBeFromPatchFile : false,
				regex : /\[Error\](?<message>[^\r\n]+?\(LuaException\) Error code 2[^\"]+\"(?<file>[^\"]+)\"]:(?<line>\d+):[^\r\n]+)/g
			},
			{
				name : "missingImage",
				severity : ErrorLevel.error,
				type : ErrorType.regex,
				couldBeFromPatchFile : false,
				regex : /\[Error\] (?<message>Could not load image asset([^\n]|\n)*?\(AssetException\) No such asset[^\n]+)/g
			},
			{
				name : "missingFrame",
				severity : ErrorLevel.error,
				type : ErrorType.regex,
				couldBeFromPatchFile : false,
				regex : /\[Error\] (?<message>Could not load image asset[^\r\n]+?[\r\n]+\(AssetException\) No associated frames file found for image[^\n]+)/g
			},
			{
				name : "jsonParsingException",
				severity : ErrorLevel.error,
				type : ErrorType.regex,
				couldBeFromPatchFile : true,
				regex : /\[Error\] Exception caught loading asset:[^\r\n]+?\(AssetException\) Could not read JSON asset\s+[^\n\r]+?.*?Caused by: \(JsonParsingException\) Cannot parse json file:[\s\r\n]+?(?<file>[^\r\n]+?)[\s\r\n]+?.*?(?<message>Caused by:.*?at (?<line>[0-9]+?)\s*?:(?<column>[0-9]+?))/gs
			}
		];
		this.errorLevels = ErrorLevel;
		this.output = null;
		this.currentErrors = [];
		this.firstErrorId = null;

		atom.commands.add('atom-workspace', 'starbound-build:error-match', ::this.showNextError);
		atom.commands.add('atom-workspace', 'starbound-build:error-match-first', ::this.showFirstError);
	}

	showError(id) {
		const currentError = this.currentErrors.find(m => m.id === id);
		if (!currentError) {
			this.emit('error', 'Can\'t find error with id ' + id);
			return;
		}

		// rotate to next error
		while (this.currentErrors[0] !== currentError) {
			this.currentErrors.push(this.currentErrors.shift());
		}
		this.currentErrors.push(this.currentErrors.shift());
				
		if (currentError.file) {
			if (currentError.fileFound) {
				// open the file if found
				// We need to remove one from the text position values present in the
				// log as atom starts line and column at 0 and not 1.
				atom.workspace.open(currentError.file, {
					initialLine: Math.max(currentError.line ? currentError.line - 1 : 0),
					initialColumn: Math.max(0,currentError.column ? currentError.column - 1 : 0),
					searchAllPanes: true
				});
			}
			else {
				this.emit('error', 'Could not find the following file who was reported to have caused an error: ' + currentError.data.groups.file);
			}
		}

		this.emit('matched', currentError.errorText);
	}

	/// Finds errors in the passed input text/log.
	/// param: source - string - The log to find errors in.
	/// param: customErrorDescriptors - array - A list of error descriptors made by a user appended to the default descriptor list.
	analyze(source, customErrorDeclarations) {
		this.currentErrors = [];

		let descriptors = this.errorRegistery;
		if (Array.isArray(customErrorDeclarations)) {
			descriptors = descriptors.concat(customErrorDeclarations);
		}
		
		let directories = atom.project.getDirectories();
		
		for (let descriptor of descriptors) {
			if (descriptor.type == ErrorType.regex) {
				let match = null;
				let matchIndex = 0;
				while(match = descriptor.regex.exec(source)) {
					let err = new IdentifiedError(descriptor,match,matchIndex++);
					err.setSeverity(descriptor.severity);
					err.setMessage(match.groups.message);
					err.setLine(match.groups.line);
					err.setColumn(match.groups.column);
					err.setErrorText(match[0]);
					if (match.groups.file) {
						for (let directory of atom.project.getDirectories()) {
							let filePath = path.join(directory.path, match.groups.file);
							if (descriptor.couldBeFromPatchFile) {
								const patchExt = ".patch";
								if (fs.existsSync(filePath + patchExt)) {
									err.setFile(filePath + patchExt, true);
									break;
								}
							}
							if (fs.existsSync(filePath)) {
								err.setFile(filePath, true);
								break;
							}
						}
					}
					
					this.currentErrors.push(err);
				}
				descriptor.regex.lastIndex = 0;
			}
		};

		this.firstErrorId = this.hasFoundErrors() ? this.currentErrors[0].id : null;
	}

	// shows
	showNextError() {
		if (this.hasFoundErrors()) {
			this.showError(this.currentErrors[0].id);
		}
	}

	showFirstError() {
		if (this.firstErrorId) {
			this.showError(this.firstErrorId);
		}
	}
	
	hasFoundErrors() {
		return this.currentErrors && this.currentErrors.length > 0;
	}

	getErrors() {
		return this.currentErrors;
	}
}
