'use strict';

const fs = require('fs');

const chalk = require('chalk');
const globby = require('globby');
const ProgressBar = require('progress');
const recast = require('ember-template-recast');

const b = recast.builders;

const TEST_SELECTOR_PREFIX = /data-test-.*/;
const NUM_STEPS = 2;

async function run(argv, cwd) {
  let step = num => chalk.dim(`[${num}/${NUM_STEPS}]`);

  let patterns = argv.slice(2);
  if (patterns.length === 0) {
    patterns.push('app/**/*.hbs');
    patterns.push('addon/**/*.hbs');
  }

  console.log(`${step(1)} 🔍  Looking for templates...`);
  let templatePaths = await globby(patterns, { cwd });

  console.log(`${step(2)} 👷‍  Migrating ${templatePaths.length} templates...`);

  let bar = new ProgressBar(`${chalk.dim('[:bar]')} :percent :etas`, {
    total: templatePaths.length,
    complete: '>',
    incomplete: ' ',
    width: 40,
  });

  for (let templatePath of templatePaths) {
    let content;
    try {
      content = fs.readFileSync(templatePath, 'utf8');
    } catch (error) {
      bar.interrupt(chalk.red(`Could not read file ${templatePath}: ${error}`));
      bar.tick();
      continue;
    }

    let root;
    try {
      root = recast.parse(content);
    } catch (error) {
      bar.interrupt(chalk.red(`Could not parse file ${templatePath}: ${error}`));
      bar.tick();
      continue;
    }

    let newContent;
    try {
      const results = transform(root);
      if (results.changed) {
        newContent = recast.print(root);
      } else {
        newContent = content;
      }
      for (const replacement of results.replacements) {
        const withEqTrue = replacement + '=true';
        if (!newContent.includes(withEqTrue)) {
          newContent = newContent.replace(replacement, withEqTrue);
        }
      }
    } catch (error) {
      bar.interrupt(chalk.red(`Could not transform file ${templatePath}: ${error}`));
      bar.tick();
      continue;
    }

    if (newContent !== content) {
      try {
        fs.writeFileSync(templatePath, newContent, 'utf8');
      } catch (error) {
        bar.interrupt(chalk.red(`Could not write file ${templatePath}: ${error}`));
        bar.tick();
        continue;
      }
    }

    bar.tick();
  }
}

function transform(root) {
  let changed = false;
  const replacements = [];
  recast.traverse(root, {
    MustacheStatement(node) {
      const result =  transformMustache(node);
      if (result.changed) {
        changed = true;
      }
      if (result.replace) {
        replacements.push(result.replace);
      }
    },
    BlockStatement(node) {
      const result = transformMustache(node);
      if (result.changed) {
        changed = true;
      }
      if (result.replace) {
        replacements.push(result.replace);
      }
    },
  });
  return { changed, replacements };
}

function transformMustache(node) {
  if (node.params.some(isTestSelectorParam)) {
    // add test selectors to `Hash` arguments
    const testSelectorParams = node.params
      .filter(param => isTestSelectorParam(param));
    const dataTestPairs = testSelectorParams
      .map(path => b.pair(path.original, b.boolean(true)));

    if (testSelectorParams.length === 1) {
      return { replace: testSelectorParams[0].original };
    }

    // order data-test-pairs first
    node.hash.pairs = dataTestPairs.concat(node.hash.pairs);

    // remove test selectors from positional arguments
    // if the only param is the sole data test param
    if (dataTestPairs.length === 1 && node.params.length === 1) {
      // move the hash to the line of the param
      node.hash.loc.start.line = node.params[0].loc.start.line;
      node.hash.loc.start.column = Math.max(node.params[0].loc.start.column, node.hash.loc.start.column);
      node.hash.pairs[0].loc.start.line = node.hash.loc.start.line;
      node.hash.pairs[0].loc.start.column = node.hash.loc.start.column;
      node.hash.pairs[0].loc.end.line = node.hash.pairs[0].loc.start.line
      node.hash.pairs[0].loc.end.column = node.params[0].loc.end.column + 5; // =true
      // dataTestPairs[0].loc.start.line = testSelectorParams[0].loc.start.line;
      // dataTestPairs[0].loc.start.column = testSelectorParams[0].loc.start.column;
      // dataTestPairs[0].loc.end.line = testSelectorParams[0].loc.end.line;
      // dataTestPairs[0].loc.end.column = testSelectorParams[0].loc.end.column + 5; // =true
    }

    node.params = node.params.filter(param => !isTestSelectorParam(param));


    return { changed: true };
  } else {
    return { changed: false };
  }
}

function isTestSelectorParam(param) {
  return param.type === 'PathExpression' && TEST_SELECTOR_PREFIX.test(param.original);
}

module.exports = { run, transform };
