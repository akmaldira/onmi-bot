const axios = require("axios");
const { Worker } = require("worker_threads");

async function getEmails(n = 10) {
  try {
    const response = await axios.get(
      `https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=${n}`
    );
    const data = response.data;
    return data;
  } catch (error) {
    console.error(`error on getting email: ${error}`);
    return [];
  }
}

async function startThread(reff, processCount) {
  const emails = await getEmails(processCount);
  let workerDone = 0;
  for (const email of emails) {
    const workder = new Worker("./worker.js");
    workder.on("message", (message) => {
      if (message.includes("done") || message.includes("Skipping...")) {
        if (!message.includes("done")) {
          console.log(message);
        }
        workerDone++;
        if (workerDone === emails.length) {
          console.log("All workers done. Registering new emails...");
          return startThread(reff, processCount);
        }
      } else {
        console.log(message);
      }
    });
    workder.postMessage({ email, reff });
  }
}

const numOfCpus = require("os").cpus().length;
(async () => {
  const reff = "T6ajX4PBwB8n";
  const processCount = Math.floor(numOfCpus / 2);
  await startThread(reff, processCount);
})();
