---
"blogger-hbs": patch
---

Resolving reads each directory once instead of trying every extension of an import with its own file system call, the file system still deciding the case of a name as an import does. In watch mode one resolver is kept, cleared before every compilation. Like an import, a file reached through a symlink resolves to the real file, so it is one chunk however it is reached, a file in the root keeping the root as it is given
