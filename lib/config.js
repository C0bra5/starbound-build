module.exports = {
	sbExecPath: {
		title: 'Starbound Executable Path',
		description: "A shortcut to typing your path name, here are some defaults that should fit most people's setup.",
		type: 'string',
		default: "Windows 64 Bit - C:\\Program Files (x86)\\Steam\\SteamApps\\common\\Starbound\\win64\\starbound.exe",
		enum: [
			"Windows 64 Bit - C:\\Program Files (x86)\\Steam\\SteamApps\\common\\Starbound\\win64\\starbound.exe",
			"Windows 32 Bit - C:\\Program Files (x86)\\Steam\\SteamApps\\common\\Starbound\\win32\\starbound.exe",
			"Mac OS X - $HOME/Library/Application Support/Steam/steamapps/common/Starbound/osx/Starbound.app/Contents/MacOS/starbound",
			"Linux - $HOME/.steam/steam/steamapps/common/Starbound/linux/run-client.sh"
		],
		order: 1
	},
	sbExecPathCustom: {
		title: 'Custom Path',
		description: 'Overrides the choice in the previous option when set',
		type: 'string',
		default : "",
		order: 2
	},
	sbLogLevel: {
		title: 'Starbound Log Level',
		description: 'Sets the log level of the log.',
		type: 'string',
		default: 'info',
		enum: [ 'debug', 'info', 'warn', 'error' ],
		order: 3
	},
	sbBootConfigFile: {
		title: 'boot configuration file path',
		description: 'Tells the game which boot configuration file to use at launch, defaults to sbinit.config',
		type: 'string',
		default : "sbinit.config",
		order: 4
	},
	hidePanelOnSucces: {
		title: 'Hide log panel after no errors.',
		description: 'Automatically hide the log pannel if the game ran into no erros.',
		type: 'boolean',
		default: false,
		order: 5
	},
	panelVisibility: {
		title: 'Panel Visibility',
		description: 'Set when the build panel should be visible.',
		type: 'string',
		default: 'Toggle',
		enum: [ 'Toggle', 'Keep Visible', 'Show on Error', 'Hidden' ],
		order: 6
	},
	hidePanelHeading: {
		title: 'Hide panel heading',
		description: 'Set whether to hide the build command and control buttons in the build panel',
		type: 'boolean',
		default: false,
		order: 7
	},
	saveOnStart: {
		title: 'Automatically save all files when starting the game',
		description: 'Automatically save all unsaved files when starting the game via atom.',
		type: 'boolean',
		default: false,
		order: 9
	},
	goToErrorOnClose: {
		title: 'Open first errorring file after closing the game',
		description: 'When an identifiable error has occures, atom will automatically attempt to open the file that caused the fist error.',
		type: 'boolean',
		default: false,
		order: 11
	},
	stealFocus: {
		title: 'Steal Focus',
		description: 'Steal focus when opening log panel.',
		type: 'boolean',
		default: true,
		order: 12
	},
	overrideThemeColors: {
		title: 'Override Theme Colors',
		description: 'Override theme background- and text color inside the terminal',
		type: 'boolean',
		default: true,
		order: 13
	},
	panelOrientation: {
		title: 'Panel Orientation',
		description: 'Where to attach the build panel',
		type: 'string',
		default: 'Bottom',
		enum: [ 'Bottom', 'Top', 'Left', 'Right' ],
		order: 18
	},
	statusBar: {
		title: 'Status Bar',
		description: 'Where to place the status bar. Set to `Disable` to disable status bar display.',
		type: 'string',
		default: 'Left',
		enum: [ 'Left', 'Right', 'Disable' ],
		order: 19
	},
	statusBarPriority: {
		title: 'Priority on Status Bar',
		description: 'Lower priority tiles are placed further to the left/right, depends on where you choose to place Status Bar.',
		type: 'number',
		default: -1000,
		order: 20
	},
	terminalScrollback: {
		title: 'Terminal Scrollback Size',
		description: 'Max number of lines of build log kept in the terminal',
		type: 'number',
		default: 1000,
		order: 21
	}
}
