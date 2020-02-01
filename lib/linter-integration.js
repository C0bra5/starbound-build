'use babel';

class Linter {
	constructor(registry) {
		this.linter = registry({ name: 'starbound-log' });
	}
	destroy() {
		this.linter.dispose();
	}
	clear() {
		this.linter.clearMessages();
	}
	showErrors(errors) {
		let toPush = [];
		for (let err of errors) {
			toPush.push({
				severity: err.severity.toLowerCase(),
				location: {
					file: err.file,
					position: [[err.line ? Math.max(0, err.line - 1) : 0, err.column ? Math.max(0, err.column - 1) : 0], [err.line ? Math.max(0, err.line - 1) : 0, err.column ? Math.max(0, err.column) : 0]]
				},
				excerpt: err.message || 'No error message recorded'
			});
		}
		this.linter.setAllMessages(toPush);
	}
}

export default Linter;
