---
"blogger-hbs": patch
---

A plugin `p` provides its main partial `{{> p}}` with the key `.` and partials with names separated by single dots, `{{> p.a.b}}` with `a.b`. The names of the partials of a plugin are checked as they are written, `{{> p..a}}` that Handlebars reads as `{{> p}}` is an error where it is, and an inline partial can not have a name of a plugin. The partials and imports in an inline partial are found too
