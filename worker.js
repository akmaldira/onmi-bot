const { parentPort } = require("worker_threads");
const axios = require("axios");
const fs = require("fs");

class Logger {
  constructor(email) {
    this.email = email;
    const logPath = "process.log";
    this.logStream = fs.createWriteStream(logPath, { flags: "a" });
  }

  log(message) {
    console.log(`[${this.email}] ${message}`);
    this.logStream.write(`[${this.email}] ${message}\n`);
  }
}

async function registerUser(
  email,
  inviteCode,
  password = "P@ssw0rd123",
  nickname = ""
) {
  const url = "https://onmi-waitlist.rand.wtf/api/register";

  const headers = {
    Host: "onmi-waitlist.rand.wtf",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0",
    Accept: "*/*",
    "Accept-Language": "id,en-US;q=0.7,en;q=0.3",
    "Accept-Encoding": "gzip, deflate, br",
    Referer: "https://onmi.io/",
    "Content-Type": "application/json",
    Origin: "https://onmi.io",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    Te: "trailers",
  };

  const payload = {
    email: email,
    nickname: nickname,
    password: password,
    password_confirmation: password,
    invite_code: inviteCode,
  };

  try {
    const response = await axios.post(url, payload, { headers });
    return response.data;
  } catch (error) {
    return null;
  }
}

async function getInboxId(email, logger, tryCount = 0) {
  const x = email.split("@");
  const login = x[0];
  const domain = x[1];
  const endpoint = `https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`;
  try {
    const response = await axios.get(endpoint);
    if (response.data.length > 0) {
      return response.data[0].id;
    }
    return getInboxId(email);
  } catch (error) {
    if (tryCount < 4) {
      if (error.message == "Request failed with status code 503") {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      return getInboxId(email, tryCount + 1);
    }
    return null;
  }
}

async function getMessage(email, id, tryCount = 0) {
  const x = email.split("@");
  const login = x[0];
  const domain = x[1];
  const endpoint = `https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${id}`;
  try {
    const response = await axios.get(endpoint);
    const messageData = response.data;
    if (messageData) {
      return messageData.body;
    }
    return null;
  } catch (error) {
    if (tryCount < 4) {
      return getMessage(email, id, tryCount + 1);
    }
    return null;
  }
}

function extractLinksFromHtml(htmlContent) {
  const hrefLinks = htmlContent.match(/href="([^"]+)"/g);
  return hrefLinks;
}

function extractVerifyLink(links, email) {
  for (const l of links) {
    const link = l.replace('href="', "").replace('"', "");
    if (link.match(/https:\/\/onmi.io\/\?verify_code=[\w-]+/)) {
      return link.split("=")[1];
    }
  }
  return null;
}

async function verifyUser(code) {
  const url = "https://onmi-waitlist.rand.wtf/api/activate";

  const headers = {
    Host: "onmi-waitlist.rand.wtf",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0",
    Accept: "*/*",
    "Accept-Language": "id,en-US;q=0.7,en;q=0.3",
    "Accept-Encoding": "gzip, deflate, br",
    Referer: "https://onmi.io/",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": "23",
    Origin: "https://onmi.io",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    Te: "trailers",
  };

  const payload = {
    code: code,
  };

  try {
    const response = await axios.post(url, payload, { headers });
    return response.data;
  } catch (error) {
    return null;
  }
}

parentPort.on("message", async (data) => {
  const { email, reff } = data;
  const logger = new Logger(email);
  const user = await registerUser(email, reff);
  if (!user) {
    parentPort.postMessage(`Failed to register user ${email}. Skipping...`);
    return;
  }
  logger.log(`User registered successfully. Getting inbox id...`);
  const inboxId = await getInboxId(email, logger);
  if (!inboxId) {
    parentPort.postMessage(`Failed to get inbox id for ${email}. Skipping...`);
    return;
  }

  logger.log(`Got inbox id ${inboxId}. Getting verify code...`);
  const message = await getMessage(email, inboxId);
  if (!message) {
    parentPort.postMessage(`Failed to get message for ${email}. Skipping...`);
    return;
  }

  const links = extractLinksFromHtml(message);
  const verifyCode = extractVerifyLink(links, email);
  if (!verifyCode) {
    parentPort.postMessage(
      `Failed to get verify code for ${email}. Skipping...`
    );
    return;
  }
  logger.log(`Got verify code ${verifyCode}. Verifying user...`);

  const verifyResponse = await verifyUser(verifyCode);
  if (!verifyResponse) {
    parentPort.postMessage(`Failed to verify user ${email}. Skipping...`);
    return;
  }

  logger.log(`User verified successfully.`);
  parentPort.postMessage(`done`);
});
