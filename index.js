const fs = require("fs");
const ICAL = require("ical.js");
const xmlbuilder = require("xmlbuilder");
const { Settings, DateTime } = require("luxon");

const TZ = "Europe/Berlin";
Settings.defaultZoneName = TZ;

var data = fs.readFileSync("basic.ics", "utf8");

var jCalData = ICAL.parse(data);
var comp = new ICAL.Component(jCalData);

var DATES = {};

comp.getAllSubcomponents("vevent").forEach(vevent => {
	var event = new ICAL.Event(vevent);

	if (event.startDate.toJSDate().getFullYear() != 2018) return;

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

var schedulexml = xmlbuilder.create("schedule");
schedulexml.ele("version", 1);
var conference = schedulexml.ele("conference");
conference.ele("acronym", "VSH");
conference.ele("title", "Verschwörhaus");

var sortedDates = Object.keys(DATES).sort();
var begin = sortedDates[0];
var end = sortedDates[sortedDates.length - 1];

var beginDT = DateTime.fromISO(begin);
var endDT = DateTime.fromISO(end);

conference.ele("start", begin);
conference.ele("end", end);

var diff = endDT.diff(beginDT, ["days"]);

conference.ele("days", diff.days);
conference.ele("timeslot_duration", "00:15");

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

		let hasException = DATES[key].some((obj) => {
			return obj.event.isRecurrenceException() && ~obj.start === ~nextStartDate;
		})

		if (!hasException) {
			DATES[key].push({ start: nextStartDate, event: event });
		}
	}
});

Object.keys(DATES)
	.sort()
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
					startOfDay.toFormat("LLdd") + (eventId < 10 ? "0" : "") + eventId
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

				xmlevent.ele("date", realStartDate.toISO());
				xmlevent.ele(
					"start",
					realStartDate.toLocaleString(DateTime.TIME_24_SIMPLE)
				);
				xmlevent.ele("duration", diff.toFormat("hh:mm"));
				xmlevent.ele("room", "Salon");
				xmlevent.ele("title", event.summary);
				xmlevent.ele("subtitle", event.description);
				var xmlpersons = xmlevent.ele("persons");
				xmlpersons.ele("person", "FIXME");
				xmlpersons.ele("person", "FIXME");

				eventId++;
			});
	});

fs.writeFileSync("schedule.xml", schedulexml.end({ pretty: true }), "utf8");
