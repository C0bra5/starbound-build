'use babel';

export default {
	config: require('./config'),

	activate() {
		require('atom-package-deps').install('starbound-build');

		this.linter = null;

		this.setupLogView();
		this.setupErrorMatcher();

		atom.commands.add('atom-workspace', 'starbound-build:start-game', () => this.startGame());
		atom.commands.add('atom-workspace', 'starbound-build:stop-game', () => this.stopGame());
		atom.commands.add('atom-workspace', 'starbound-build:confirm', () => document.activeElement.click());
		atom.commands.add('atom-workspace', 'starbound-build:clear-errors', () => {
			if (this.linter){
				this.linter.clear();
			}
		});
		atom.commands.add('atom-workspace', 'starbound-build:no-confirm', () => {
			if (this.saveConfirmView) {
				this.saveConfirmView.cancel();
			}
		});
	},

	setupLogView() {
		const LogView = require('./log-view');
		this.logView = new LogView();
	},

	setupErrorMatcher() {
		const ErrorMatcher = require('./error-matcher');
		this.errorMatcher = new ErrorMatcher();
		this.errorMatcher.on('error', (message) => {
			atom.notifications.addError('Error matching failed!', { detail: message });
		});
		this.errorMatcher.on('matched', (text) => {
			if(text) {
				this.logView.scrollTo(text);
			}
		});
	},

	deactivate() {
		if (this.child) {
			this.child.removeAllListeners();
			require('tree-kill')(this.child.pid, 'SIGKILL');
			this.child = null;
		}

		if (this.statusBarView) {
			this.statusBarView.destroy();
		}
		if (this.logView) {
			this.logView.destroy();
		}
		if (this.saveConfirmView) {
			this.saveConfirmView.destroy();
		}
		if (this.linter) {
			this.linter.destroy();
		}

		clearTimeout(this.finishedTimer);
	},

	sendNextSignal() {
		try {
			const signal = this.child.killSignals.shift();
			require('tree-kill')(this.child.pid, signal);
		} catch (e) {
			/* Something may have happened to the child (e.g. terminated by itself). Ignore this. */
		}
	},

	abortGame(cb) {
		if (!this.child.killed) {
			this.logView.gameAbortInitiated();
			this.child.killed = true;
			this.child.on('exit', () => {
				this.child = null;
				if (cb) {
					cb();
				}
			});
		}

		this.sendNextSignal();
	},

	startGame() {
		clearTimeout(this.finishedTimer);

		this.doSaveConfirm(this.unsavedTextEditors(), () => {
			if (this.child) {
				return this.abortGame();
			}
			else {
				const BuildError = require('./build-error');
				const path = require('./utils').activePath();
				if (this.linter){
					this.linter.clear();
				}
		
				try {
					this.logView.setHeading("Starbound Log")
					if (this.statusBarView)
					{
						this.statusBarView.setTarget("Running Starbound");
						this.statusBarView.gameStarted();
					}
					
					if (this.busyRegistry) {
						this.busyRegistry.begin('build.starbound', 'starbound');
					}
					
					this.logView.gameStarted();
				
					let execPath = atom.config.get('starbound-build.sbExecPathCustom');
					if(execPath == null || execPath == "") {
						let opt = atom.config.get('starbound-build.sbExecPath').split(" - ");
						execPath = opt[1];
					}
					const args = ['-bootconfig', atom.config.get('starbound-build.sbBootConfigFile'), "-loglevel", atom.config.get('starbound-build.sbLogLevel')].map(arg => arg);
		
					try {
						this.child = require('child_process').spawn(execPath, args);
						
					} catch (e) {
						if (e.message == "spawn UNKNOWN") {
							e.stack = null;
							e.message = "It looks like atom doesn't have the permission to launch starbound, try changing the starbound executable's permission or launching atom as administrator."
						}
						throw e;
					}
		
					let stdout = '';
					let stderr = '';
					this.child.stdout.setEncoding('utf8');
					this.child.stderr.setEncoding('utf8');
					this.child.stdout.on('data', d => (stdout += d));
					this.child.stderr.on('data', d => (stderr += d));
					this.child.stdout.pipe(this.logView.terminal);
					this.child.stderr.pipe(this.logView.terminal);
					this.child.killSignals = ([ 'SIGINT', 'SIGTERM', 'SIGKILL' ]).slice();
		
					this.child.on('error', (err) => {
						console.log(err);
						this.logView.terminal.write(('Unable to execute: ') + exec + '\n');
						if (/\s/.test(exec)) {
							this.logView.terminal.write('`cmd` cannot contain space. Use `args` for arguments.\n');
						}
		
						if ('ENOENT' === err.code) {
							this.logView.terminal.write(`Could not find or launch starbound. Make sure the game executable are located in: '${exec}'.\n`);
						}
					});
		
					this.child.on('close', (exitCode) => {
						this.statusBarView.setTarget("Starbound stopped");
						this.child = null;
						this.errorMatcher.analyze(stdout + stderr, null);
		
						let success = (0 === exitCode) && !this.errorMatcher.hasFoundErrors();
		
						if (this.linter){
							this.linter.showErrors(this.errorMatcher.getErrors());
						}
		
						if (this.busyRegistry) {
							this.busyRegistry.end('build.starbound', success);
						}
						this.logView.gameClosed(success);
						if (this.statusBarView) {
							this.statusBarView.setBuildSuccess(success);
						}
						if (success) {
							if (atom.config.get('starbound-build.hidePanelOnSucces')) {
								this.finishedTimer = setTimeout(() => {
									this.logView.detach();
								}, 1200);
							}
						} else {
							this.logView.setHeading(`Starbound Log - ${this.errorMatcher.getErrors().length} error${(this.errorMatcher.getErrors().length > 0 ? "s" : "")} generated.`)
							if (atom.config.get('starbound-build.scrollOnError')) {
								this.errorMatcher.showFirstError();
							}
						}
					});
				}
				catch(err){
					if (err instanceof BuildError) {
						atom.notifications.addWarning(err.name, { detail: err.message, stack: err.stack });
					} else {
						atom.notifications.addError('Failed to build.', { detail: err.message, stack: err.stack,dismissible: true });
					}
				};
			}
		});
	},

	doSaveConfirm(modifiedTextEditors, continuecb, cancelcb) {
		const saveAndContinue = (save) => {
			modifiedTextEditors.forEach((textEditor) => save && textEditor.save());
			continuecb();
		};

		if (0 === modifiedTextEditors.length || atom.config.get('starbound-build.saveOnStart')) {
			saveAndContinue(true);
			return;
		}

		if (this.saveConfirmView) {
			this.saveConfirmView.destroy();
		}

		const SaveConfirmView = require('./save-confirm-view');
		this.saveConfirmView = new SaveConfirmView();
		this.saveConfirmView.show(saveAndContinue, cancelcb);
	},

	unsavedTextEditors() {
		return atom.workspace.getTextEditors().filter((textEditor) => {
			return textEditor.isModified() && (undefined !== textEditor.getPath());
		});
	},

	stopGame() {
		clearTimeout(this.finishedTimer);
		if (this.child) {
			this.abortGame(() => {
				this.logView.gameAborted();
				if (this.statusBarView) {
					this.statusBarView.gameAborted();
				}
			});
		} else {
			this.logView.reset();
		}
	},

	consumeLinterRegistry(registry) {
		if (this.linter) {
			this.linter.destroy();
		}
		const Linter = require('./linter-integration');
		this.linter = new Linter(registry);
	},

	consumeStatusBar(statusBar) {
		const StatusBarView = require('./status-bar-view');
		this.statusBarView = new StatusBarView(statusBar);
		this.statusBarView.onClick(() => this.logView.toggle());
		this.statusBarView.attach();
	},

	consumeBusy(registry) {
		this.busyRegistry = registry;
	}
};
