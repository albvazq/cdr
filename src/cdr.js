'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
// const folderExists = spawn('ls', ['-lh', '/usr']);
const libsCache = {};

function onlyUnique(value, index, self) { 
  return self.indexOf(value) === index;
}

var createMakefile = function(cdrObject) {
  const compilationString = 'g++ -std=c++11 -pthread -Wall ${INCLUDE}';
  // Get lib headers
  const include = [];
  const compilationFiles = [];
  const objectFiles = [];;
  for(const lib in libsCache) {
    include.push(`-I${libsCache[lib].absolutePath}/include`);
    if(libsCache[lib].cdr) {
      const fileList = walkSync(`${libsCache[lib].absolutePath}/src`);
      fileList.forEach(f => {
        const obj = `./build/${lib}/${f[0]}.o`;
        objectFiles.push(obj)
        compilationFiles.push(`${compilationString} ${f[1]} -o ${obj}`)
      });
    }
  }

  include.push('-I./include');

  // current project files
  const projectFileList = walkSync(`./src`);
  projectFileList.forEach(f => {
    // Does not consider collision for files with same name.
    const obj = `./build/${f[0]}.o`;
    objectFiles.push(obj)
    compilationFiles.push(`${compilationString} ${f[1]} -o ${obj}`)
  });

  let flags = [];
  Object.values(libsCache).forEach(l => flags = flags.concat(l.flags ? l.flags : []));
  flags = flags.filter(onlyUnique).map(flag => `-L${flag}`);
  const makeFileLines = [
    `INCLUDE=${include.join(' ')}`,
    `OBJS=${objectFiles.join(' ')}`,
    `LIBS=${flags.join(' ')}`,
    `${cdrObject.name}: ${cdrObject.entry}`,
    `\tif [ -d build ]; then rm -Rf build; fi`,
    ...compilationFiles.map(cf => `\t${cf}`),
    `\tif [ -f thermo ]; then rm thermo; fi`,
    '\tg++ ${OBJS} -o app ${LIBS}'
  ];

  fs.writeFile("Makefile", makeFileLines.join('\n'), function(err) {
    if(err) {
        return console.log(err);
    }
  });
}

var cloneLib = async function(name, repo, path) {
  return new Promise(function(resolve, reject) {
    const clone = spawn('git', [
      'clone',
      repo,
      `${path}/${name}`
    ]);
    clone.on('close', (code) => {
      resolve();
    });
  });
}

var downloadLibs = async function(path, cdrObject) {
  // Download libraries for project
  // Proccess libraries
  const libs = [];
  if (!fs.existsSync(`${path}libs`)) {
    spawn('mkdir', [`${path}libs`]);
  }

  for(const lib in cdrObject.libs) {
    if(!libsCache[lib]) {
      await cloneLib(lib, cdrObject.libs[lib].repo, `${path}/libs`);
      // console.log("Clonned: ", lib);
      // resolveProject(`./${lib}`);
      libs.push(`${path}libs/${lib}`);
      libsCache[lib] = {
        'absolutePath': `${path}libs/${lib}`,
        'flags': cdrObject.libs[lib].flags,
        'cdr': cdrObject.libs[lib].cdr === undefined ? true : cdrObject.libs[lib].cdr
      };
    }
  }
  return libs;
}

var getFileName = function(f) {
  return f.substring(0, f.indexOf('.'));
}

var walkSync = function(dir, filelist) {
  var path = path || require('path');
  var fs = fs || require('fs'),
      files = fs.readdirSync(dir);
  filelist = filelist || [];
  files.forEach(function(file) {
      if (fs.statSync(path.join(dir, file)).isDirectory()) {
          filelist = walkSync(path.join(dir, file), filelist);
      }
      else {
          filelist.push([getFileName(file), path.join(dir, file)]);
      }
  });
  return filelist;
};

var resolveProject = async function(path) {
  if (!fs.existsSync(`${path}/cdr.json`)) {
    return;
  }
  let rawdata = fs.readFileSync(`${path}/cdr.json`);
  let cdrObject = JSON.parse(rawdata);

  if(cdrObject.libs !== undefined) {
    const libs = await downloadLibs(path, cdrObject);
    for(const l of libs) {
      await resolveProject(l);
    }
  }
  return cdrObject;
}

var CDR = async function() {
  console.log('CDR v1.0');
  // console.log(process.cwd());
  let cdrObject = await resolveProject('./');
  if(cdrObject !== undefined) {
    createMakefile(cdrObject);
  }
}

module.exports = {
  'CDR': CDR
}