const fs = require("fs");
const ICAL = require("ical.js");
const xmlbuilder = require("xmlbuilder");
const sanitizeHtml = require("sanitize-html");
const { Settings, DateTime } = require("luxon");

const TZ = "Europe/Berlin";
Settings.defaultZoneName = TZ;

const DEFAULT_ROOM = "Salon";
// FILTER_START: set to null if all events should be used
const FILTER_START = DateTime.local().startOf('month');

var data = fs.readFileSync("basic.ics", "utf8");

var jCalData = ICAL.parse(data);
var comp = new ICAL.Component(jCalData);

var DATES = {};

comp.getAllSubcomponents("vevent").forEach(vevent => {
	var event = new ICAL.Event(vevent);

	if (event.isRecurring()) {
		// recurring events get handled below
		return;
	}

	let startDate = DateTime.fromJSDate(event.startDate.toJSDate(), {
		zone: TZ
	});

	let key = startDate.toISODate();
	if (typeof DATES[key] === "undefined") {
		DATES[key] = [];
	}
	DATES[key].push({ start: startDate, event: event });
});

// add recurring events
comp.getAllSubcomponents("vevent").forEach(vevent => {
	var event = new ICAL.Event(vevent);

	if (!event.isRecurring()) {
		return;
	}

	var expand = event.iterator();

	var next;
	while ((next = expand.next())) {
		let nextStartDate = DateTime.fromJSDate(next.toJSDate(), {
			zone: TZ
		});
		if (nextStartDate > endDT) {
			break;
		}

		let key = nextStartDate.toISODate();
		if (typeof DATES[key] === "undefined") {
			DATES[key] = [];
		}

		let hasException = DATES[key].some(obj => {
			return (
				obj.event.isRecurrenceException() &&
				~obj.start === ~nextStartDate
			);
		});

		if (!hasException) {
			DATES[key].push({ start: nextStartDate, event: event });
		}
	}
});

const parseDescription = description => {
	let room = DEFAULT_ROOM;

	description = sanitizeHtml(description, { allowedTags: ['br'] })
				  .replace(/\<br\s*\/?\>/g, "\n")
				  .trim();

	let roomMatch = description.match(/^\u{1F4CD}\s*(.+)$/gmu);
	if (roomMatch) {
		room = roomMatch[roomMatch.length - 1]
			.replace(/\u{1F4CD}\s*/u, "")
			.trim();
		description = description.replace(roomMatch[roomMatch.length - 1], "");
	}

	let groups = [];
	let groupMatch = description.match(/^\u{1F3E2}\s*(.+)$/gmu);
	if (groupMatch) {
		groupMatch.forEach(m => {
			groups.push(m.replace(/\u{1F3E2}\s*/u, "").trim());
			description = description.replace(m, "");
		});
	}

	let people = [];
	let personMatch = description.match(/^\u{1F642}\s*(.+)$/gmu);
	if (personMatch) {
		personMatch.forEach(p => {
			people.push(p.replace(/\u{1F642}\s*/u, "").trim());
			description = description.replace(p, "");
		});
	}

	let subtitle = description.trim();
	let subMatch = description.match(/^\u{1F5A5}\s*(.+)$/gmu);
	if (subMatch) {
		subtitle = subMatch[subMatch.length - 1]
			.replace(/\u{1F5A5}\s*/u, "")
			.trim();
		description = description.replace(subMatch[subMatch.length - 1], "");
	}

	description = description.trim();

	return {
		description: description,
		subtitle: subtitle,
		room: room,
		groups: groups,
		people: people
	};
};

var schedulexml = xmlbuilder.create("schedule");
schedulexml.ele("version", 1);
var conference = schedulexml.ele("conference");
conference.ele("acronym", "VSH");
conference.ele("title", "Verschwörhaus");

var sortedDates = Object.keys(DATES).sort();
var begin = sortedDates[0];
var end = sortedDates[sortedDates.length - 1];

var beginDT = DateTime.fromISO(begin);
var endDT = DateTime.fromISO(end).endOf("year");

conference.ele("start", beginDT.toISODate());
conference.ele("end", endDT.toISODate());

var diff = endDT.diff(beginDT, ["days"]);

conference.ele("days", Math.ceil(diff.days));
conference.ele("timeslot_duration", "00:15");

Object.keys(DATES)
	.sort()
	.filter(key => {
		if (FILTER_START === null) {
			return true;
		}
		return DateTime.fromISO(key) >= FILTER_START;
	})
	.filter(key => {
		return !DATES[key].every(obj => {
			return obj.event.summary == "Busy";
		});
	})
	.forEach(function(key) {
		var xmlday = schedulexml.ele("day");
		xmlday.att("index", "1");
		xmlday.att("date", key);
		let startOfDay = DateTime.fromISO(key).set({ hour: 7 });
		xmlday.att("start", startOfDay.toISO());
		let endOfDay = DateTime.fromISO(key)
			.plus({ day: 1 })
			.set({ hour: 3 });
		xmlday.att("end", endOfDay.toISO());

		var xmlroom = xmlday.ele("room");
		xmlroom.att("name", "Verschwörhaus");

		var eventId = 1;

		DATES[key]
			.sort((a, b) => {
				if (a.start < b.start) {
					return -1;
				}
				if (a.start > b.start) {
					return 1;
				}
				return 0;
			})
			.forEach(obj => {
				let realStartDate = obj.start;
				let event = obj.event;
				// skip hidden events
				if (event.summary == "Busy") return;

				var xmlevent = xmlroom.ele("event");
				xmlevent.att(
					"id",
					startOfDay.toFormat("LLdd") +
						(eventId < 10 ? "0" : "") +
						eventId
				);

				// calculate duration with the real event timestamps (not the repeated one)
				let eventStartDate = DateTime.fromJSDate(
					event.startDate.toJSDate(),
					{
						zone: TZ
					}
				);
				let eventEndDate = DateTime.fromJSDate(
					event.endDate.toJSDate(),
					{
						zone: TZ
					}
				);
				let diff = eventEndDate.diff(eventStartDate, [
					"hours",
					"minutes"
				]);

				let desc = parseDescription(event.description);

				if (desc.description.length == 0) {
					console.warn(realStartDate.toISO(), event.summary, "Description empty");
				} else if (desc.description == desc.subtitle) {
					console.warn(realStartDate.toISO(), event.summary, "Subtitle override missing");
				}
				if (desc.groups.length == 0 && desc.people.length == 0) {
					console.warn(realStartDate.toISO(), event.summary, "People missing");
				}

				xmlevent.ele("date", realStartDate.toISO());
				xmlevent.ele(
					"start",
					realStartDate.toLocaleString(DateTime.TIME_24_SIMPLE)
				);
				xmlevent.ele("duration", diff.toFormat("hh:mm"));
				xmlevent.ele("room", desc.room);
				xmlevent.ele("title", event.summary);
				xmlevent.ele("subtitle", desc.subtitle);
				var xmlpersons = xmlevent.ele("persons");
				desc.groups.forEach(group => {
					xmlpersons.ele("person", group);
				});
				desc.people.forEach(person => {
					xmlpersons.ele("person", person);
				});
				eventId++;
			});
	});

fs.writeFileSync("schedule.xml", schedulexml.end({ pretty: true }), "utf8");
