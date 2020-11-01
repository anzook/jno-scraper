const mongoose = require("mongoose");
const chrome = require("selenium-webdriver/chrome");
const fs = require("fs");
// const Nightmare = require("nightmare");
const chalk = require("chalk");
require("chromedriver");
// const nightmare = Nightmare({ show: true });
const Room = require("./Room");
// const PROJECT_COUNT = 200;

const { Builder, By } = require("selenium-webdriver");
const helpers = require("./helpers");
const slowFactor = helpers.slowFactor;
const dlFactor = 3;
let projectCountTarget;
let currentSubjectCountTarget;
let currentTopicCountTarget;
let currentRoomCountTarget;

require("dotenv").config();
const startTime = Date.now();
let runTime;
async function scrape(counts) {
  const { projectCount, subjectCount, topicCount, roomCount } = counts;
  let driver = null;

  try {
    let url = helpers.baseURL + "/VMTLobby/commons/index.jsp"; // old: http://192.168.1.110/VMTLobby/commons/index.jsp
    driver = new Builder().forBrowser("chrome").build();
    // await driver
    //   .manage()
    //   .window()
    //   .setRect({ width: 1240, height: 1080, x: 0, y: 0 });
    let usernameSel = "input[name='j_username']";
    let passwordSel = "input[name='j_password']";
    let submitSel = "input[name='submit']";
    let communityListSel = `#communityList1`;
    let subjectListItemSel = "#subjectsList > li";
    let error = null;

    // subject > room > topic > download
    async function login() {
      await helpers.navigateAndWait(driver, url, usernameSel);
      await helpers.findInputAndType(driver, usernameSel, process.env.user);
      await helpers.findInputAndType(driver, passwordSel, process.env.pw);
      await helpers.findAndClickElement(driver, submitSel);
      await helpers.waitForSelector(driver, communityListSel);
      console.log(chalk.gray("Log in complete!"));
    }

    await login();

    // PARSE PROJECT INFO
    if (!projectCountTarget) {
      await driver.sleep(500 * slowFactor);
      projectList = await driver.findElements(
        By.css("#communityList1 > option")
      );
      projectCountTarget = projectList.length - 1; // options are zero indexed so the last project is option #298
    }
    console.log(chalk.gray("Project Count Target: ", projectCountTarget));
    if (projectCount > projectCountTarget) {
      // done
      let results = {
        document: null,
        counts: {
          roomCount,
          topicCount,
          subjectCount,
          projectCount,
        },
      };
      return results;
    }
    let project;
    try {
      await driver.sleep(750); // reguarly needing retry- adding initial pause to increase intial success
      project = await helpers.selectOption(
        driver,
        communityListSel,
        projectCount,
        true
      );
    } catch (err) {
      try {
        console.log(chalk.red("couldnt select options 😢"));
        console.log("trying again");
        await driver.sleep(3000 * slowFactor);
        project = await helpers.selectOption(
          driver,
          communityListSel,
          projectCount,
          true
        );
      } catch (err) {
        try {
          console.log(chalk.red("really couldnt select options 😢 😢 😢"));
          console.log("trying one last time...");
          await driver.sleep(6000 * slowFactor);
          project = await helpers.selectOption(
            driver,
            communityListSel,
            projectCount,
            true
          );
        } catch (err) {
          // ESCAPE CLAUSE
          // projectName = "ERR:No Project Located!";
          console.log(chalk.red.bold("ESCAPE COND- COULD NOT GET PROJ TITLE!"));
          let results = {
            document: null,
            counts: {
              roomCount,
              topicCount,
              subjectCount,
              projectCount,
            },
          };
          return results;
        }
      }
    }
    // PRINT Status: Project
    if (project) console.log(chalk.cyan("Project found!..."));

    let projectName = await project.getAttribute("innerText");
    // PRINT Status: Project Name
    if (projectName) console.log(chalk.cyan("Project name: ", projectName));

    await project.click();
    await helpers.findAndClickElement(driver, "input[name='refreshButton']");
    await driver.sleep(1250 * slowFactor);
    await helpers.waitForSelector(driver, "#subjectsList");

    // PARSE SUBJECT INFO
    let subjectListItems = await helpers.getWebElements(
      driver,
      subjectListItemSel
    );

    // PRINT Status: Project Name
    if (subjectListItems)
      console.log(
        chalk.cyan(projectName, " has ", subjectListItems.length, " subjects.")
      );

    if (subjectListItems.length === 0) {
      console.log("Project has no subjects, looking again...");
      await driver.sleep(250 * slowFactor);
      subjectListItems = await helpers.getWebElements(
        driver,
        subjectListItemSel
      );
      if (subjectListItems.length === 0) {
        console.log(chalk.red("Project has no subjects"));
        // project has no subjects
        let results = {
          document: null,
          counts: {
            roomCount,
            topicCount,
            subjectCount,
            projectCount,
          },
        };
        return results;
      }
    }

    if (!currentSubjectCountTarget) {
      currentSubjectCountTarget = subjectListItems.length - 1;
    }

    let subject = subjectListItems[subjectCount];
    let subjectName = await subject.getAttribute("innerText");
    // PRINT Status: Subject Name
    if (subjectName)
      console.log(chalk.cyan(subjectName, " is subject #: ", subjectCount));
    // let subjectExpandBtn = await subject.findElement({ xpath: "./img[1]" });

    let subjectExpandBtn = await helpers.waitForElementsChild(
      driver,
      subject,
      "./img[1]"
    );
    await subjectExpandBtn.click();
    let topicList = await helpers.waitForElementsChild(
      driver,
      subject,
      "./ul[1]"
    );
    // PRINT Status: Topic List
    if (topicList) console.log(chalk.cyan("Topic List found!"));
    // TOPIC INFO
    // let topicList = await subject.findElement({ xpath: "./ul[1]" });
    await driver.sleep(350);
    let topicListEls = await topicList.findElements({ xpath: "./li" });
    if (!topicListEls || topicListEls.length === 0) {
      if (!topicListEls) {
        console.log(chalk.red("No topic list found!"), "...trying agin");
      }
      await driver.sleep(750 * slowFactor);
      topicListEls = await topicList.findElements({ xpath: "./li" });
      if (topicListEls.length === 0) {
        // subject has no topics
        console.log(chalk.red("subject has no topics"));
        let results = {
          document: null,
          counts: {
            roomCount,
            topicCount,
            subjectCount,
            projectCount,
          },
        };
        return results;
      }
    }

    if (!currentTopicCountTarget) {
      // topicListEls = await topicList.findElements({ xpath: "./li" });
      currentTopicCountTarget = topicListEls.length;
    }
    // PRINT Status: Topic List Elements
    if (topicListEls)
      console.log(chalk.cyan("Topic List elements :", topicListEls.length));

    // let topicListEl = await topicList.findElement({
    //   xpath: `./li[${topicCount + 1}]`
    // });
    await driver.sleep(250);
    let topicListEl;
    try {
      topicListEl = await helpers.waitForElementsChild(
        driver,
        topicList,
        `./li[${topicCount + 1}]`
      );
    } catch (err) {
      if (!topicListEl) {
        console.log(
          `Topic list had ${
            topicListEls.length
          } topics but could not find topic ${topicCount + 1} `
        );
      }
      console.log("Err: Trying to find topic again...", err);
      await driver.sleep(500 * slowFactor);
      topicListEl = await helpers.waitForElementsChild(
        driver,
        topicList,
        `./li[${topicCount + 1}]`
      );
    }

    // PRINT Status: Topic Elementt
    if (topicListEl) console.log(chalk.cyan("Topic element found!"));

    // let roomExpandBtn = await topicListEl.findElement({ xpath: "./img[1]" });
    let roomExpandBtn;
    await driver.sleep(250);
    try {
      roomExpandBtn = await helpers.waitForElementsChild(
        driver,
        topicListEl,
        "./img[1]"
      );
    } catch (err) {
      console.log("Err: Trying to find room expnd again...", err);
      await driver.sleep(500 * slowFactor);
      roomExpandBtn = await helpers.waitForElementsChild(
        driver,
        topicListEl,
        "./img[1]"
      );
    }

    // PRINT Status: Topic Name
    if (roomExpandBtn) console.log(chalk.cyan("Room expand button located!"));
    // ROOM INFO
    await roomExpandBtn.click();
    let topicLink;
    await driver.sleep(250);
    try {
      // let topicLink = await topicListEl.findElement({ xpath: "./span/a" });
      topicLink = await helpers.waitForElementsChild(
        driver,
        topicListEl,
        "./span/a"
      );
    } catch (err) {
      console.log("Err: Trying to topic link info again...", err);
      await driver.sleep(500 * slowFactor);
      topicLink = await helpers.waitForElementsChild(
        driver,
        topicListEl,
        "./span/a"
      );
    }

    topicName = await topicLink.getAttribute("innerText");

    // PRINT Status: Topic Name
    if (topicName) console.log(chalk.cyan("Topic found:", topicName));

    let roomList = await helpers.waitForElementsChild(
      driver,
      topicListEl,
      "./ul[1]"
    );
    // PRINT Status: Room list
    if (roomList) console.log(chalk.cyan("Room list found!"));

    // let roomList = await topicListEl.findElement({ xpath: "./ul[1]" });
    // console.log(`Found room list for topic ${topicName}`);
    let roomListEls = await roomList.findElements({ xpath: "./li" });

    if (!currentRoomCountTarget) {
      currentRoomCountTarget = roomListEls.length;
    }

    if (roomListEls.length === 0) {
      // no rooms afte expanding topic
      try {
        await driver.sleep(750 * slowFactor);
        roomListEls = await roomList.findElements({ xpath: "./li" });
      } catch (err) {
        console.log(
          chalk.red(err),
          chalk.cyan("no rooms after expanding topic: ", topicName)
        );
        let results = {
          document: null,
          counts: {
            roomCount,
            topicCount,
            subjectCount,
            projectCount,
          },
        };
        return results;
      }
    }
    // PRINT Status: Topic rooms
    console.log(
      chalk.cyan(
        `...Room List for ${topicName} has ${roomListEls.length} rooms`
      )
    );

    await driver.sleep(250);
    // let room = await roomList.findElement({ xpath: `./li[${roomCount + 1}]` });
    let room = await helpers.waitForElementsChild(
      driver,
      roomList,
      `./li[${roomCount + 1}]`
    );
    try {
      roomName = await room.getAttribute("innerText");
    } catch (err) {
      try {
        console.log(chalk.red("Room error :", err));
        console.log(chalk.gray(`Trying to find the room again...`));
        await driver.sleep(1000 * slowFactor);
        if (!room) {
          console.log(
            chalk.cyan.bold(`Room list had elements but no room found`)
          );
          room = await helpers.waitForElementsChild(
            driver,
            roomList,
            `./li[${roomCount + 1}]`
          );
        }
        roomName = await room.getAttribute("innerText");
      } catch (err) {
        console.log(chalk.red.bold("Room error repeat:", err));
        console.log(chalk.gray(`Trying to find the room one last time...`));
        await driver.sleep(2500 * slowFactor);
        if (!room) {
          console.log(
            chalk.cyan.bold(`Room list had elements but no room found`)
          );
          room = await helpers.waitForElementsChild(
            driver,
            roomList,
            `./li[${roomCount + 1}]`
          );
        }
        await driver.sleep(500 * slowFactor);
        roomName = await room.getAttribute("innerText");
      }
    }

    // PRINT Status: Room Name
    if (roomName) console.log(chalk.cyan("Room found:", roomName));
    // ESCAPE CLAUSE
    if (!roomName) {
      projectName = "ERR:No Room Name Found!";
      console.log(chalk.red.bold("ESCAPE COND- COULD NOT GET ROOM NAME!"));
      let results = {
        document: null,
        counts: {
          roomCount,
          topicCount,
          subjectCount,
          projectCount,
        },
      };
      return results;
    }
    await driver.sleep(250);
    let roomLink = await helpers.waitForElementsChild(driver, room, `./img`);
    let CID;
    try {
      CID = await roomLink.getAttribute("id");
    } catch (err) {
      console.log(chalk.red("CID error :", err));
      console.log(chalk.gray(`Trying to get the CID again...`));
      await driver.sleep(1500 * slowFactor);
      if (!roomLink) {
        console.log(chalk.cyan.bold(`No Room-link element found!`));
        roomLink = await helpers.waitForElementsChild(driver, room, `./img`);
      }
      CID = await roomLink.getAttribute("id");
    }

    // PRINT Status: CID
    if (CID) console.log(chalk.cyan("CID found:", CID));

    // let showDownloadBtn = await room.findElement({ xpath: "./img[1]" });
    // let showDownloadBtn = await helpers.waitForElementsChild(driver, room, "./img[1]");
    // try {
    //   await showDownloadBtn.click();
    // } catch (err) {
    //   console.log(chalk.red("showDownload btn IS NON INTERACTABLE???"));
    //   console.log(err);
    //   console.log(" trying again");
    //   driver.sleep(2000);
    //   await showDownloadBtn.click();
    // }
    // await helpers.waitForElementsChild(driver, room, "./div[1]");
    // DL phase start

    // Legacy code removed for CSS selectors, new approach URL generation. See other/old branch for code

    // URL generation method
    let csvLink = null;
    let jnoLink = null;
    // SAVE RESULTS
    projectName = projectName.trim().replace(/[\/:]/g, ".");
    subjectName = subjectName.trim().replace(/[\/:]/g, ".");
    topicName = topicName.trim().replace(/[\/:]/g, ".");
    roomName = roomName.trim().replace(/[\/:]/g, ".");

    // .jno DL
    try {
      jnoLink = await helpers.findAndDLbyURL(driver, roomName, CID);
    } catch (err) {
      console.log(chalk.red("download error??"));
      console.log("JNO Dl error: ", err);
      error = "JNO download couldnt be completed ";
    }

    // PRINT Status: JNO Link
    if (jnoLink) console.log(chalk.cyan("JNO Link: ", jnoLink));

    // Check if the room is empty and skip CSV dl, TODO FEATURE DEVELOPMENT PAUSED, see other Branch

    // .csv DL
    try {
      csvLink = await helpers.findCSVAndDLbyURL(driver, roomName, CID);
    } catch (err) {
      console.log(chalk.red("download btn error??"));
      console.log("CSV Dl error: ", err);
      if (!error) {
        error = "CSV download couldnt be completed ";
      } else error += "JNO and CSV downloads could not be completed ";
    }

    // PRINT Status: CSV Link
    if (csvLink) console.log(chalk.cyan("CSV Link:", csvLink));

    // WAIT FOR FILE TO DOWNLOAD
    console.log("Waiting for file to download...");
    await confirmFileDownloaded(roomName);
    await confirmCSVDownloaded(roomName);
    const path = `/${projectName}/${subjectName}/${topicName}/${roomName}.jno`;
    // const csvPath = `/${projectName}/${subjectName}/${topicName}/${roomName}.csv`;
    // var cleanPath = path.replace(/[|&;$%@":<>()+,]/g, "");
    // console.log({ path });
    // PRINT Status: JNO Link
    if (jnoLink) console.log(chalk.cyan("Files saved to: ", path));
    // DL Phase end
    let results = {
      document: {
        projectName,
        subjectName,
        topicName,
        roomName,
        path,
        csvLink,
        jnoLink,
      },
      counts: {
        roomCount,
        topicCount,
        subjectCount,
        projectCount,
      },
    };

    if (error) {
      console.log("results", results);
      results.document.error = error;
    }
    // results.counts.projectCount++;

    if (projectCount > projectCountTarget) {
      console.log("all done");
      mongoose.connection.close();
    }
    driver.quit();
    return results;
  } catch (err) {
    console.log({ err });
    mongoose.connection.close();
    driver.quit();
  }
}

async function confirmFileDownloaded(fileName) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    // console.log("Startime: ", startTime);
    const fileCheckerInterval = setInterval(() => {
      fs.stat(
        `${`/Users/${process.env.whoami}/Downloads/${fileName}.jno`}`,
        function (err, stats) {
          if (stats) {
            clearInterval(fileCheckerInterval);
            console.log("the .jno file has been downloaded");
            resolve("success");
          } else if (err) {
            currentTime = Date.now();
            // console.log({ currentTime: Date.now() });
            if (currentTime - startTime > 11000 * slowFactor * dlFactor) {
              clearInterval(fileCheckerInterval);
              resolve();
            }
            return;
          }
        }
      );
    }, 1000);
  });
}

async function confirmCSVDownloaded(fileName) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    // console.log("Startime: ", startTime);
    const fileCheckerInterval = setInterval(() => {
      fs.stat(
        `${`/Users/${process.env.whoami}/Downloads/${fileName}_multicolumn.csv`}`,
        function (
          // fs.stat(`${`/Users/Dan/Downloads/${fileName}.jno`}`
          err,
          stats
        ) {
          if (stats) {
            clearInterval(fileCheckerInterval);
            console.log("the .csv file has been downloaded");
            resolve("success");
          } else if (err) {
            currentTime = Date.now();
            // console.log({ currentTime: Date.now() });
            if (currentTime - startTime > 7000 * slowFactor * dlFactor) {
              clearInterval(fileCheckerInterval);
              resolve();
            }
            return;
          }
        }
      );
    }, 1000);
  });
}

async function recursiveScrape(counts) {
  try {
    const scrapeData = await scrape(counts);
    let run;
    if (!runTime) {
      runTime = Date.now();
    } else {
      run = Date.now();
      run -= runTime;
    }
    runTime = Date.now();
    let endTime = runTime - startTime;
    console.log(chalk.magenta("Iteration: ", run / 1000));
    console.log(chalk.magenta("Runtime: ", endTime / 1000));
    console.log("scrape data: ", { scrapeData });
    if (scrapeData) {
      if (scrapeData.document !== null) {
        const {
          projectName,
          subjectName,
          topicName,
          roomName,
        } = scrapeData.document;
        const srcPath = `/Users/${process.env.whoami}/Downloads/${roomName}.jno`;
        const CSVsrcPatch = `/Users/${process.env.whoami}/Downloads/${roomName}_multicolumn.csv`;
        const targetPath = `/Users/${process.env.whoami}/Documents/Data/21pstem/jno-scraper/ALLFiles/${projectName}/${subjectName}/${topicName}`;
        await buildPaths(targetPath);
        const { success, err } = await saveFile(
          srcPath,
          targetPath + `/${roomName}.jno`
        );
        const { CSVsuccess, CSVerr } = await saveFile(
          CSVsrcPatch,
          targetPath + `/${roomName}.csv`
        );
        if (err || CSVerr) {
          scrapeData.document.error = err + CSVerr;
        }
        await saveToDb(scrapeData.document);
        console.log(chalk.blue("saved to db"));
      }
    } // else if (!scrapeData) scrapeData.counts = counts;
    if (scrapeData.counts.projectCount > projectCountTarget) {
      console.log(chalk.green.bold("Scrape complete!"));
      mongoose.connection.close();
      process.exit;
    } else {
      const updatedCounts = updateCounts(scrapeData.counts);
      recursiveScrape(updatedCounts);
    }
  } catch (err) {
    console.log(chalk.red("Error in scrape"));
    console.log({ err });
  }
}

function saveToDb(data) {
  const room = new Room(data);
  return room.save();
}

function buildPaths(path) {
  return new Promise(async (resolve, reject) => {
    const directories = path.split("/");
    const paths = [];
    let p;
    for (i = 0; i < directories.length; i++) {
      p = "";
      for (x = 0; x <= i; x++) {
        if (x > 0) {
          p += "/";
        }
        p += directories[x];
      }
      paths.push(p);
    }
    paths.shift();
    try {
      const { success, err } = await checkDirectoryRecursive(paths);
      resolve({ success, err });
    } catch (err) {
      reject(err);
    }
  });
}

function checkDirectoryRecursive(dirs) {
  return new Promise((resolve, reject) => {
    dir = dirs.shift();
    fs.stat(dir, function (err, stats) {
      if (stats) {
        if (dirs.length > 0) {
          resolve(checkDirectoryRecursive(dirs));
        } else {
          resolve({ success: "success", err: null });
        }
      }
      //Check if error defined and the error code is "not exists"
      if (
        err &&
        (err.errno === -2 || err.errno === 34 || err.errno === -4058)
      ) {
        //Create the directory, call the callback.
        fs.mkdir(dir, (err) => {
          if (err) {
            reject(err);
          } else if (dirs.length > 0) {
            resolve(checkDirectoryRecursive(dirs));
          } else {
            return resolve({ succes: "succes", err: null });
          }
        });
      } else if (err) {
        resolve({ success: null, err: "couldnt make directory" });
      }
    });
  });
}

function saveFile(src, trg) {
  return new Promise((resolve, reject) => {
    fs.rename(src, trg, (err) => {
      if (err) {
        console.log(chalk.red.bold("err renaming: "), err);
        resolve({ success: null, err: "could not download" + src });
      } else {
        console.log(chalk.green.bold("file saved: "), trg);
        resolve({ success: "success", err: null });
      }
    });
    // reject(new Error("Save file process error!"))
  });
}

function updateCounts({ roomCount, topicCount, subjectCount, projectCount }) {
  console.log({
    counts: { roomCount, topicCount, subjectCount, projectCount },
  });
  console.log({
    targets: {
      currentRoomCountTarget,
      currentSubjectCountTarget,
      currentTopicCountTarget,
      projectCountTarget,
    },
  });
  roomCount += 1;
  if (roomCount >= currentRoomCountTarget) {
    topicCount += 1;
    roomCount = 0;
    currentRoomCountTarget = null;
  }

  if (topicCount >= currentTopicCountTarget) {
    subjectCount += 1;
    topicCount = 0;
    currentTopicCountTarget = null;
  }

  if (subjectCount > currentSubjectCountTarget) {
    subjectCount = 0;
    projectCount += 1;
    currentSubjectCountTarget = null;
  }
  console.log(chalk.magenta("updatedCounts: "), {
    roomCount,
    topicCount,
    subjectCount,
    projectCount,
  });
  return { roomCount, topicCount, subjectCount, projectCount };
}

let mongoURI = "mongodb://localhost/vmtjnofiles";
mongoose.connect(mongoURI, { useNewUrlParser: true }, (err, res) => {
  if (err) {
    console.log(chalk.red("DB CONNECTION FAILED: " + err));
  } else {
    console.log(chalk.blue("DB CONNECTION SUCCESS" + mongoURI));
    // Starting scrape position
    let projectCount = 151; // start at 1 because 0 is "All" we dont want all we want each project individually so we get its actual name instead of the name "All"
    let subjectCount = 0;
    let topicCount = 1;
    let roomCount = 1;
    const counts = { projectCount, subjectCount, topicCount, roomCount };
    console.log("Counts:", counts);
    console.log(
      chalk.yellow("~~~~~~~~~~ "),
      chalk.green.bold("Starting scrape"),
      chalk.yellow(" ~~~~~~~~~~")
    );
    recursiveScrape(counts);
  }
});
