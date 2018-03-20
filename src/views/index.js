const { remote, ipcRenderer } = require('electron');
const { join } = require('path');
const { readFile, writeFileSync } = require('fs');
const h = require('hyperscript');
const csv = require('fast-csv');
const { Rekapi, Actor } = require('rekapi');
const { loggerStdout } = require(join(process.cwd(), 'src', 'utils', 'utils.js'));
const PositionMarker = require(join(process.cwd(), 'src', 'utils', 'PositionMarker.js'));
const signals = require(join(process.cwd(), 'config', 'signals.js'));


let firstTimeStamp = null;
const dancers = new Map();
// const distances = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const distances = [40, 40, 40, 40, 40, 40, 40, 40, 40, 40];
const filePath = join(process.cwd(), 'assets', 'danceData.csv');
const filePathProcessed = join(process.cwd(), 'assets', 'danceData.processed.json');
const [ winContentSizeWidth, winContentSizeHeight ] = remote.getCurrentWindow().getContentSize();
const canvas = h(
	'canvas#animationCanvas'
	, {
		width: winContentSizeWidth
		, height: winContentSizeHeight
		, onclick() {
			ipcRenderer.send('signal', 'playPause');
		}
	}
	, 'Sorry no canvas to draw on.'
);

const rekapi = new Rekapi(canvas.getContext('2d'));

const playPause = () => {
	if (rekapi.isPlaying()) {
		rekapi.pause();
	} else {
		const replayCount = 1;

		rekapi.play(replayCount);
	}
};

const csvTransformer = ([
	dancerId
	, x
	, , y
	, timestamp
]) => [
	dancerId
	, parseFloat(x.replace(/,/g, '.'))
	, parseFloat(y.replace(/,/g, '.'))
	, parseFloat(timestamp.replace(/,/g, '.'))
];

const addPathsToDancers = ([
	dancerId
	, x
	, y
	, timestamp
]) => {
	if (dancers.has(dancerId) === false) {
		dancers.set(dancerId, []);
	}
	dancers.get(dancerId).push([ x, y, timestamp ]);
};

const addPlayPauseHandler = () => {
	ipcRenderer.on('signal', (event, message) => {
		if (signals.get('playPause') === message) {
			playPause();
		}
		loggerStdout(message);
	});
};

const normalizeDancePaths = (dancePathsMap) => {
	// projectionWidth in meter @TODO - move to settings
	const projectionWidth = 3;
	// projectionHeight in meter @TODO - move to settings
	const projectionHeight = 1.75;
	const widthCoefficient = winContentSizeWidth / projectionWidth;
	const heightCoefficient = winContentSizeHeight / projectionHeight;
	let avg = 0;
	let numberOfElements = 0;

	dancePathsMap.forEach((val) => {
		avg += val.reduce((carry, curr) => carry + curr[1], 0);
		numberOfElements += val.length;
	});
	avg /= numberOfElements;
	dancePathsMap.forEach((val) => {
		val.forEach(([x, z, timestamp], i, arr) => {
			let time = 0;

			if (firstTimeStamp === null) {
				firstTimeStamp = timestamp;
			} else {
				time = timestamp - firstTimeStamp;
			}

			arr[i] = [x * widthCoefficient + winContentSizeWidth / 2, (z - avg) * heightCoefficient + winContentSizeHeight / 2, time];
		});
	});
};

const getRandomIntInclusive = (min, max) => {
	min = Math.ceil(min);
	max = Math.floor(max);

	// The maximum is inclusive and the minimum is inclusive
	return Math.floor(Math.random() * (max - min + 1)) + min;
};

const importTimeline = (data) => {
	const timeline = JSON.parse(data);

	rekapi.importTimeline(timeline);
};

/* eslint max-statements: "off" */
const renderMyShit = (ctx, state) => {
	if (!state.shouldRender) {
		return;
	}

	ctx.save();


	ctx.beginPath();
	ctx.arc(state.x, state.y, state.radius, 0, Math.PI * 2);
	ctx.closePath();

	ctx.setLineDash([2, 5]);
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
	ctx.stroke();

	ctx.beginPath();
	ctx.moveTo(state.p0x, state.p0y);
	ctx.lineTo(state.p1x, state.p1y);
	ctx.lineTo(state.p2x, state.p2y);
	ctx.lineTo(state.p3x, state.p3y);
	ctx.lineTo(state.p4x, state.p4y);
	ctx.lineTo(state.p5x, state.p5y);
	ctx.lineTo(state.p6x, state.p6y);
	ctx.lineTo(state.p7x, state.p7y);
	ctx.lineTo(state.p8x, state.p8y);
	ctx.lineTo(state.p9x, state.p9y);
	ctx.closePath();

	ctx.setLineDash([]);
	ctx.strokeStyle = state.color;
	ctx.stroke();


	ctx.restore();
};

const doMyShit = () => {
	dancers.forEach((dancerPath) => {
		const actor = new Actor({ render: renderMyShit });

		dancerPath.forEach(([ x, y, timestamp ]) => {
			if (actor.hasKeyframeAt(timestamp) === false) {

				const myArr = new Array(10);

				distances.forEach((el, key) => {
					myArr[key] = el + getRandomIntInclusive(-5, 5);
				});

				// const bla = new PositionMarker(x, y, distances);
				const bla = new PositionMarker(x, y, myArr);

				actor.keyframe(timestamp, bla);

				// bla.dancerId = dancerId;
				// bla.time = timestamp;
				// csvStream.write(bla);
			}
		});

		if (actor.hasKeyframeAt(0) === false) {
			actor.copyKeyframe(actor.getStart(), 0);
			actor.modifyKeyframe(0, { shouldRender: false });
		}

		rekapi.addActor(actor);
	});

	writeFileSync(join(process.cwd(), 'assets', 'danceData.processed.json'), JSON.stringify(rekapi.exportTimeline({ withId: true })));
};

const loadProcessCSV = () => {
	csv
		.fromPath(
			filePath
			, {
				delimiter: ';'
				, trim: true
				, ignoreEmpty: true
			}
		)
		.transform(csvTransformer)
		.on('data', addPathsToDancers)
		.on('end', () => {
			normalizeDancePaths(dancers);

			doMyShit();
		});
};


// ############# calling part ###############


document.getElementById('mainAnimationContainer').appendChild(canvas);
// @TODO: Show load screen

readFile(filePathProcessed, (err, data) => {
	if (err) {
		if (err.code === 'ENOENT') {
			// Processed file does not exist.

			// @TODO: Show warning for long calculation
			// Load csv file and process it
			loadProcessCSV();

			return;
		}
		throw err;
	}

	try {
		importTimeline(data);
		rekapi.getAllActors().forEach((el) => el.render = renderMyShit);
	} catch (error) {
		loggerStdout(error);
		// Load csv file and process it
		loadProcessCSV();
	}

	rekapi.on('animationComplete', () => loggerStdout('animation complete'));
	addPlayPauseHandler();
	document.getElementById('loading').remove();
});


