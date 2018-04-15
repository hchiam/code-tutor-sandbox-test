'use strict';

const fs = require('fs');
const express = require('express');
const app = express();

if (!process.env.DISABLE_XORIGIN) {
  app.use(function(req, res, next) {
    var allowedOrigins = ['codepen.io','https://www.freecodecamp.com'];
    var origin = req.headers.origin || '*';
    if(!process.env.XORIG_RESTRICT || allowedOrigins.indexOf(origin) > -1){
         console.log(origin);
         res.setHeader('Access-Control-Allow-Origin', origin);
         res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    }
    next();
  });
}


app.use('/public', express.static(process.cwd() + '/public'));


app.route('/:words').get(function(req, res, next) {
  var requestData = req.params.words;
  
  // here's what we send back:
  var outputData = {
    code: makeIntoCode(requestData),
    variables: variables
  };
  
  // here we actually send the data back:
  res.type('json').send(outputData);
});


app.route('/').get(function(req, res) {
  res.sendFile(process.cwd() + '/views/index.html');
  // var outputData = {code: '< Enter code in natural language >'};
  // res.type('json').send(outputData);
})


// Respond not found to all the wrong routes
app.use(function(req, res, next){
  res.status(404);
  res.type('txt').send('404: Not found');
});


// Error Middleware
app.use(function(err, req, res, next) {
  if(err) {
    res.status(err.status || 500)
      .type('txt')
      .send(err.message || 'SERVER ERROR');
  }  
})


app.listen(process.env.PORT, function () {
  console.log('Node.js listening ...');
});



/////////////////////////////////////////////////////////////////////////////////



// here's the interesting stuff:

let variables = []; // make this the only global variable so that getVariables and .map(otherReplacements) work right


const userConfused = (words) => {
  return !words.includes(' ') || words.match(/(^what.+?|^how.+?)/g);
}


const makeIntoCode = (words) => {
  if (userConfused(words)) {
    let decision = Math.floor((Math.random() * 6) + 1);
    if (decision === 1) {
      return 'Try this: say hi';
    } else if (decision === 2) {
      return 'Try this: say hi 3 times';
    } else if (decision === 3) {
      return 'Try this: let x equal 1';
    } else if (decision === 4) {
      return 'Try this: x equals 1 and a';
    } else if (decision === 5) {
      return 'Try this: set x equal to 3.14';
    } else {
      return 'Try this: x equals 1 and 2 and abc';
    }
  }
  
  let codeLines = words.replace(/ +/g,' ').split('\n');
  
  codeLines = codeLines.map(replaceVariableAssignment); // 1) ... equals ... (and ... and ...)
  
  // so other replacements functions can replace string words with recognized variables
  getVariables(codeLines);
  // do other other replacements
  codeLines = codeLines.map(otherReplacements);
  // try to prevent nested loops (to avoid overly long runtimes)
  codeLines = suppressNestedLoops(codeLines);
  // fix indents after if and for
  codeLines = autoIndent(codeLines);
  
  return codeLines.join('\n'); // put it back together as one string
}


const otherReplacements = (words) => {
  let code = words;
  
  code = replaceLoop(code); // 2) repeat ... times
  code = replaceSay(code); // 3) say ...
  code = replaceIf(code); // 4) if ... equals ... (then)
  code = handleDelete(code); // 5) delete line ...
  code = handleRunCode(code); // 6) run code
  code = handleUndo(code); // 7) undo
  
  return code;
}


const suppressNestedLoops = (code) => {
  if (code.length < 2) return code; // escape early
  
  for (let i=1; i<code.length; i++) {
    let prevIsFor = code[i-1].match(/[^ ]*for /i); // [^ ]* in case of indenting
    let currIsFor = code[i].match(/[^ ]*for /i);
    // for -> for
    if (prevIsFor && currIsFor) {
      code[i] = `<for security, can't loop right after/inside loop>`;
    }
    // for -> if -> for
    if (i > 2) {
      let preprevIsFor = code[i-2].match(/[^ ]*for /i);
      let prevIsIf = code[i-1].match(/[^ ]*if /i);
      let currIsFor = code[i].match(/[^ ]*for /i);
      if (preprevIsFor && prevIsIf && currIsFor) {
        code[i] = `<for security, can't loop inside loop>`;
      }
    }
  }
  
  return code;
}


const autoIndent = (code) => {
  
  // handle special-recognition phrases that have more than 1 line generated from 1 line of natural-language text
  for (let i=0; i<code.length; i++) {
    if (code[i].includes('\n')) {
      let firstPart = code[i].split('\n')[0];
      let secondPart = code[i].split('\n')[1];
      code[i] = secondPart;
      code.splice(i, 0, firstPart);
    }
  }
  
  if (code.length < 2) return code; // escape early
  
  // initialize
  let currIndents = 0;
  
  // go through each line of code
  for (let i=1; i<code.length; i++) {
    let prevIsIfOrFor = code[i-1].match(/ *(if |for ).+/i);
    let currLineCode = code[i];//.match(/ *(.+)/i)[1];
    if (prevIsIfOrFor) {
      currIndents++;
    } else { // if (currIndents > -1) { // in future
      // currIndents--; // in future
      currIndents = 0;
    } 
    code[i] = '  '.repeat(currIndents) + currLineCode;
  }
  
  return code;
}


// 1) ... equals ... (and ... and ...)
const replaceVariableAssignment = (words) => {
  let code = words;
  const variableAssignment = /^(let |var |variable |const |set )?([^ ]+) (equals?( to)?|=|is) (.+)/i; // i means case-insensitive
  // const variableAssignment = /^(let |var |variable |const |set )?([^ ]+) (equals?( to)?|=|is) (.+)( and .+)?/i; // i means case-insensitive
  
  let match = words.match(variableAssignment);
  if (match) {
    let variableName = match[2];
    let variableValue = checkVariableValues(match[5]);
    if (variableValue.includes(variableName)) {
      code = `${variableName} = ${variableValue};`;
    } else {
      code = `let ${variableName} = ${variableValue};`;
    }
  }
  return code;
}


const checkVariableValues = (value) => {
  let code = value;
  if (code.match(/.+ and .+/i)) {
    code = code.split(' and ').map(wrapNaNWithQuotes).join(', ');
    code = `[${code}]`;
  } else if (isNaN(code) && isNotAVariable(code)) {
    if (code.includes(' plus')) {
      code = code.replace(/ plus/g,' +');
    } else {
      code = `"${code}"`;
    }
  }
  return code;
}


const wrapNaNWithQuotes = (elem) => {
  if (isNaN(elem) && isNotAVariable(elem)) {
    return `"${elem}"`;
  } else {
    return elem;
  }
}


// get variables to recognize and replace string words
const getVariables = (codeLines_WithVariableAssignmentsMade) => {
  variables = codeLines_WithVariableAssignmentsMade.reduce(
    (total, elem) => {
      if (String(elem).startsWith('let ')) {
        return total + '., ' + elem;
      } else {
        return total;
      }
    }
  );
  variables = variables.split('., ').map(
    (elem) => {
      let match = elem.match(/let (.+) = .+;/i);
      if (match) {
        return elem.match(/let (.+) = .+;/i)[1];
      } else {
        return '<delete this>';
      }
    }
  );
  if (variables[0] === '<delete this>') {
    variables = variables.slice(1);
  }
  variables = variables.join(', ');
}


const isNotAVariable = (word) => {
  return !(variables.includes(word));
}


// 2) repeat ... times
const replaceLoop = (words) => {
  let code = words;
  let match = words.match(/^(repeat|for) (.+) times?/i); // \d times -> .+ times, in case variable name
  if (match) code = `for (let i=0; i<${match[2]}; i++)`;
  // (for ... to ...)
  let matchAlternate = words.match(/^for (.+) to (.+?)( times?)?/i);
  if (matchAlternate) code = `for (let i=${matchAlternate[1]}; i<=${matchAlternate[2]}; i++)`;
  return code;
}


// 3) say ...
const replaceSay = (words) => {
  let code = words;
  let match = words.match(/^say (.+?)( (.+) times?)?$/i); // \d times -> .+ times, in case variable name
  if (match) {
    let value = match[1];
    value = checkVariableValues(value);
    code = `say(${value});`;
    // (say ... ... times)
    if (match[2]) code = `for (let i=0; i<${match[3]}; i++)\n${code}`;
  }
  return code;
}


// 4) if ... equals ... (then)
const replaceIf = (words) => {
  let code = words;
  let match = words.match(/^if (.+) (equals?( to)?|=|is) (.+)( then)?/i);
  if (match) {
    let variableName = match[1];
    let variableValue = match[4];
    code = `if (${variableName} == ${checkVariableValues(variableValue)})`;
    // do not enable "if ... equals ... then ..." because that would complicate other things
  }
  return code;
}


// 5) delete line ...
const handleDelete = (words) => {
  let code = words;
  let match = words.match(/delete line (.+)/i);
  if (match) code = `<delete line ${match[1]}>`;
  return code;
}


// 6) run code
const handleRunCode = (words) => {
  if (words === 'run code') return '<run code>';
  return words;
}


// 7) undo
const handleUndo = (words) => {
  if (words === 'undo') return '<undo the previous line>';
  return words;
}



/////////////////////////////////////////////////////////////////////////////////


