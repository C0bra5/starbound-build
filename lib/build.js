'use babel';

export default {
	config: require('./config'),

	activate() {
		if (!/^win/.test(process.platform)) {
			// Manually append /usr/local/bin as it may not be set on some systems,
			// and it's common to have node installed here. Keep it at end so it won't
			// accidentially override any other node installation

			// Note: This should probably be removed in a end-user friendly way...
			process.env.PATH += ':/usr/local/bin';
		}

		require('atom-package-deps').install('starbound-build');

		this.tools = [ require('./atom-build') ];
		this.linter = null;

		this.setupTargetManager();
		this.setupBuildView();
		this.setupErrorMatcher();

		atom.commands.add('atom-workspace', 'starbound-build:trigger', () => this.build('trigger'));
		atom.commands.add('atom-workspace', 'starbound-build:stop', () => this.stop());
		atom.commands.add('atom-workspace', 'starbound-build:confirm', () => {
			document.activeElement.click();
		});
		atom.commands.add('atom-workspace', 'starbound-build:no-confirm', () => {
			if (this.saveConfirmView) {
				this.saveConfirmView.cancel();
			}
		});

		atom.workspace.observeTextEditors((editor) => {
			editor.onDidSave(() => {
				if (atom.config.get('starbound-build.buildOnSave')) {
					this.build('save');
				}
			});
		});

		atom.workspace.onDidChangeActivePaneItem(() => this.updateStatusBar());
		atom.packages.onDidActivateInitialPackages(() => this.targetManager.refreshTargets());
	},

	setupTargetManager() {
		const TargetManager = require('./target-manager');
		this.targetManager = new TargetManager();
		this.targetManager.setTools(this.tools);
		this.targetManager.on('refresh-complete', () => {
			this.updateStatusBar();
		});
		this.targetManager.on('new-active-target', (path, target) => {
			this.updateStatusBar();

			if (atom.config.get('starbound-build.selectTriggers')) {
				this.build('trigger');
			}
		});
		this.targetManager.on('trigger', atomCommandName => this.build('trigger', atomCommandName));
	},

	setupBuildView() {
		const BuildView = require('./build-view');
		this.buildView = new BuildView();
	},

	setupErrorMatcher() {
		const ErrorMatcher = require('./error-matcher');
		this.errorMatcher = new ErrorMatcher();
		this.errorMatcher.on('error', (message) => {
			atom.notifications.addError('Error matching failed!', { detail: message });
		});
		this.errorMatcher.on('matched', (match) => {
			match[0] && this.buildView.scrollTo(match[0]);
		});
	},

	deactivate() {
		if (this.child) {
			this.child.removeAllListeners();
			require('tree-kill')(this.child.pid, 'SIGKILL');
			this.child = null;
		}

		this.statusBarView && this.statusBarView.destroy();
		this.buildView && this.buildView.destroy();
		this.saveConfirmView && this.saveConfirmView.destroy();
		this.linter && this.linter.destroy();
		this.targetManager.destroy();

		clearTimeout(this.finishedTimer);
	},

	updateStatusBar() {
		let trg = atom.config.get('starbound-build.sbExecPathCustom');
		if(trg == null || trg == "") {
			trg =	"Starbound " + atom.config.get('starbound-build.sbExecPath').split(" - ")[0]
		} else {
			trg = "Starbound Custom"
		}
		this.statusBarView.setTarget(trg);
	},

	startNewBuild(source, atomCommandName) {
		const BuildError = require('./build-error');
		const path = require('./utils').activePath();
		let buildTitle = '';
		this.linter && this.linter.clear();

		Promise.resolve(null).then(targets => {

			this.statusBarView && this.statusBarView.buildStarted();
			this.busyRegistry && this.busyRegistry.begin('build.starbound', 'starbound');
			this.buildView.buildStarted();

			return null;
		}).then(target => {
			const replace = require('./utils').replace;
			const env = Object.assign({}, process.env, {});
			Object.keys(env).forEach(key => {
				env[key] = replace(env[key], {});
			});
		buildTitle = "Starbound Custom"
			let execPath = atom.config.get('starbound-build.sbExecPathCustom');
			if(execPath == null || execPath == "") {
				let opt = atom.config.get('starbound-build.sbExecPath').split(" - ");
				execPath = opt[1];
				buildTitle = "Starbound " + opt[0];
			}
			const exec = replace(execPath, {});
			const args = ['-bootconfig',atom.config.get('starbound-build.sbBootConfigFile'),"-loglevel",atom.config.get('starbound-build.sbLogLevel')].map(arg => replace(arg, {}));
			const cwd = replace("{PROJECT_PATH}", {});
			const isWin = process.platform === 'win32';
			const shCmd = isWin ? 'cmd' : '/bin/sh';
			const shCmdArg = isWin ? '/C' : '-c';

			this.buildView.setHeading(buildTitle);

			try {
				this.child = require('cross-spawn').spawn(
					exec,
					args,
					{ cwd: cwd, env: env }
				);
			} catch (e) {
				if (e.message = "spawn UNKNOWN") {
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
			this.child.stdout.pipe(this.buildView.terminal);
			this.child.stderr.pipe(this.buildView.terminal);
			this.child.killSignals = ([ 'SIGINT', 'SIGTERM', 'SIGKILL' ]).slice();

			this.child.on('error', (err) => {
				this.buildView.terminal.write(('Unable to execute: ') + exec + '\n');

				if (/\s/.test(exec)) {
					this.buildView.terminal.write('`cmd` cannot contain space. Use `args` for arguments.\n');
				}

				if ('ENOENT' === err.code) {
					this.buildView.terminal.write(`Make sure cmd:'${exec}' and cwd:'${cwd}' exists and have correct access permissions.\n`);
					this.buildView.terminal.write(`Binaries are found in these folders: ${process.env.PATH}\n`);
				}
			});

			this.child.on('close', (exitCode) => {
				this.child = null;
				this.errorMatcher.set(null, cwd, stdout + stderr);

				let success = (0 === exitCode);
				if (atom.config.get('starbound-build.matchedErrorFailsBuild')) {
					success = success && !this.errorMatcher.getMatches().some(match => match.type && match.type.toLowerCase() === 'error');
				}

				this.linter && this.linter.processMessages(this.errorMatcher.getMatches(), cwd);

				if (atom.config.get('starbound-build.beepWhenDone')) {
					atom.beep();
				}

				this.buildView.setHeading('Running postBuild...');
				return Promise.resolve(null).then(() => {
					this.buildView.setHeading(buildTitle);

					this.busyRegistry && this.busyRegistry.end('build.starbound', success);
					this.buildView.buildFinished(success);
					this.statusBarView && this.statusBarView.setBuildSuccess(success);
					if (success) {
						this.finishedTimer = setTimeout(() => {
							this.buildView.detach();
						}, 1200);
					} else {
						if (atom.config.get('starbound-build.scrollOnError')) {
							this.errorMatcher.matchFirst();
						}
					}

					this.nextBuild && this.nextBuild();
					this.nextBuild = null;
				});
			});
		}).catch((err) => {
			if (err instanceof BuildError) {
				if (source === 'save') {
					// If there is no eligible build tool, and cause of build was a save, stay quiet.
					return;
				}

				atom.notifications.addWarning(err.name, { detail: err.message, stack: err.stack });
			} else {
				atom.notifications.addError('Failed to build.', { detail: err.message, stack: err.stack,dismissible: true });
			}
		});
	},

	sendNextSignal() {
		try {
			const signal = this.child.killSignals.shift();
			require('tree-kill')(this.child.pid, signal);
		} catch (e) {
			/* Something may have happened to the child (e.g. terminated by itself). Ignore this. */
		}
	},

	abort(cb) {
		if (!this.child.killed) {
			this.buildView.buildAbortInitiated();
			this.child.killed = true;
			this.child.on('exit', () => {
				this.child = null;
				cb && cb();
			});
		}

		this.sendNextSignal();
	},

	build(source, event) {
		clearTimeout(this.finishedTimer);

		this.doSaveConfirm(this.unsavedTextEditors(), () => {
			const nextBuild = this.startNewBuild.bind(this, source, event ? event.type : null);
			if (this.child) {
				this.nextBuild = nextBuild;
				return this.abort();
			}
			return nextBuild();
		});
	},

	doSaveConfirm(modifiedTextEditors, continuecb, cancelcb) {
		const saveAndContinue = (save) => {
			modifiedTextEditors.forEach((textEditor) => save && textEditor.save());
			continuecb();
		};

		if (0 === modifiedTextEditors.length || atom.config.get('starbound-build.saveOnBuild')) {
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

	stop() {
		this.nextBuild = null;
		clearTimeout(this.finishedTimer);
		if (this.child) {
			this.abort(() => {
				this.buildView.buildAborted();
				this.statusBarView && this.statusBarView.buildAborted();
			});
		} else {
			this.buildView.reset();
		}
	},

	consumeLinterRegistry(registry) {
		this.linter && this.linter.destroy();
		const Linter = require('./linter-integration');
		this.linter = new Linter(registry);
	},

	consumeBuilder(builder) {
		if (Array.isArray(builder)) this.tools.push(...builder); else this.tools.push(builder);
		this.targetManager.setTools(this.tools);
		const Disposable = require('atom').Disposable;
		return new Disposable(() => {
			this.tools = this.tools.filter(Array.isArray(builder) ? tool => builder.indexOf(tool) === -1 : tool => tool !== builder);
			this.targetManager.setTools(this.tools);
		});
	},

	consumeStatusBar(statusBar) {
		const StatusBarView = require('./status-bar-view');
		this.statusBarView = new StatusBarView(statusBar);
		this.statusBarView.onClick(() => this.targetManager.selectActiveTarget());
		this.statusBarView.attach();
	},

	consumeBusy(registry) {
		this.busyRegistry = registry;
		this.targetManager.setBusyRegistry(registry);
	}
};
