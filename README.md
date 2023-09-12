ical2schedule
=============

This project tries to convert an ical file (usually exported from the
[temporärhaus google calendar](https://calendar.google.com/calendar/ical/slaun4l80uh2s0ototiol4qkgo%40group.calendar.google.com/public/basic.ics)
) to a frab compatible `schedule.xml` file for our [info-beamer](https://info-beamer.com) setup.

The code is not tested, makes quite much temporärhaus-only assumptions and could be improved. But even in its current 
form, its somewhat better than manually wrangling xml files. Have fun.


Usage
-----

* `npm install`
* download the [`basic.ics`](https://calendar.google.com/calendar/ical/slaun4l80uh2s0ototiol4qkgo%40group.calendar.google.com/public/basic.ics) and put it in the same directory
* `node index.js`
* look into the created `schedule.xml`
