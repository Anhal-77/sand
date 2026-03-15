// ════════════════════════════════════════════════════════
//  Hajj Call-Sync — Google Apps Script Backend
//  انشري هذا الكود في Google Apps Script وانشري كـ Web App
// ════════════════════════════════════════════════════════

const SPREADSHEET_ID     = "10d3_7ox7rib7qbRhEujTlaXzWs-GbkaM-gBh-FwO4vU";
const SHEET_NAME_MEMBERS = "Members";
const SHEET_NAME_SOS     = "SOS_Log";
const SHEET_NAME_GROUPS  = "Groups";

// ── GET Handler ──────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action;
  const code   = e.parameter.code;

  try {
    if (action === "getMembers") {
      return jsonResponse(getMembers(code));
    }
    if (action === "getSOS") {
      return jsonResponse(getSOS(code));
    }
    if (action === "ping") {
      return jsonResponse({ status: "ok", time: new Date().toISOString() });
    }
    return jsonResponse({ error: "unknown action" });
  } catch(err) {
    return jsonResponse({ error: err.toString() });
  }
}

// ── POST Handler ─────────────────────────────────────────
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;

  try {
    if (action === "joinGroup")   return jsonResponse(joinGroup(data));
    if (action === "updateLocation") return jsonResponse(updateLocation(data));
    if (action === "sendSOS")     return jsonResponse(sendSOS(data));
    if (action === "clearSOS")    return jsonResponse(clearSOS(data));
    if (action === "leaveGroup")  return jsonResponse(leaveGroup(data));
    return jsonResponse({ error: "unknown action" });
  } catch(err) {
    return jsonResponse({ error: err.toString() });
  }
}

// ── Helper ───────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    // Add headers
    if (name === SHEET_NAME_MEMBERS) {
      sheet.appendRow(["groupCode","memberId","name","isDeaf","lat","lng","lastSeen","sos"]);
    } else if (name === SHEET_NAME_SOS) {
      sheet.appendRow(["groupCode","memberId","name","timestamp","lat","lng"]);
    } else if (name === SHEET_NAME_GROUPS) {
      sheet.appendRow(["groupCode","groupName","created"]);
    }
  }
  return sheet;
}

// ── Join / Create Member ──────────────────────────────────
function joinGroup(data) {
  const sheet = getSheet(SHEET_NAME_MEMBERS);
  const rows = sheet.getDataRange().getValues();

  // Check if member already exists
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.groupCode && rows[i][1] === data.memberId) {
      // Update existing
      sheet.getRange(i + 1, 5).setValue(data.lat || 21.4225);
      sheet.getRange(i + 1, 6).setValue(data.lng || 39.8262);
      sheet.getRange(i + 1, 7).setValue(new Date().toISOString());
      return { status: "updated" };
    }
  }

  // Add group if new
  const groupSheet = getSheet(SHEET_NAME_GROUPS);
  const groupRows = groupSheet.getDataRange().getValues();
  let groupExists = false;
  for (let i = 1; i < groupRows.length; i++) {
    if (groupRows[i][0] === data.groupCode) { groupExists = true; break; }
  }
  if (!groupExists) {
    groupSheet.appendRow([data.groupCode, data.groupName || "مجموعة", new Date().toISOString()]);
  }

  // Add new member
  sheet.appendRow([
    data.groupCode,
    data.memberId,
    data.name,
    data.isDeaf ? "TRUE" : "FALSE",
    data.lat || 21.4225,
    data.lng  || 39.8262,
    new Date().toISOString(),
    "FALSE"
  ]);

  return { status: "joined" };
}

// ── Update Location ───────────────────────────────────────
function updateLocation(data) {
  const sheet = getSheet(SHEET_NAME_MEMBERS);
  const rows  = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.groupCode && rows[i][1] === data.memberId) {
      sheet.getRange(i + 1, 5).setValue(data.lat);
      sheet.getRange(i + 1, 6).setValue(data.lng);
      sheet.getRange(i + 1, 7).setValue(new Date().toISOString());
      return { status: "ok" };
    }
  }
  return { status: "not_found" };
}

// ── Get Members ───────────────────────────────────────────
function getMembers(groupCode) {
  const sheet = getSheet(SHEET_NAME_MEMBERS);
  const rows  = sheet.getDataRange().getValues();
  const members = [];

  // Auto-clean stale members (> 10 min inactive)
  const now = Date.now();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== groupCode) continue;
    const lastSeen = new Date(rows[i][6]).getTime();
    if ((now - lastSeen) > 10 * 60 * 1000) continue; // Skip stale

    members.push({
      memberId: rows[i][1],
      name:     rows[i][2],
      isDeaf:   rows[i][3] === "TRUE" || rows[i][3] === true,
      lat:      parseFloat(rows[i][4]) || 21.4225,
      lng:      parseFloat(rows[i][5]) || 39.8262,
      lastSeen: rows[i][6],
      sos:      rows[i][7] === "TRUE" || rows[i][7] === true,
    });
  }
  return { members };
}

// ── SOS ───────────────────────────────────────────────────
function sendSOS(data) {
  // Log it
  const logSheet = getSheet(SHEET_NAME_SOS);
  logSheet.appendRow([
    data.groupCode, data.memberId, data.name,
    new Date().toISOString(), data.lat || "", data.lng || ""
  ]);

  // Flag in members sheet
  const sheet = getSheet(SHEET_NAME_MEMBERS);
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.groupCode && rows[i][1] === data.memberId) {
      sheet.getRange(i + 1, 8).setValue("TRUE");
      return { status: "sos_sent" };
    }
  }
  return { status: "member_not_found" };
}

function clearSOS(data) {
  const sheet = getSheet(SHEET_NAME_MEMBERS);
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.groupCode && rows[i][1] === data.memberId) {
      sheet.getRange(i + 1, 8).setValue("FALSE");
      return { status: "ok" };
    }
  }
  return { status: "not_found" };
}

// ── Leave Group ───────────────────────────────────────────
function leaveGroup(data) {
  const sheet = getSheet(SHEET_NAME_MEMBERS);
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.groupCode && rows[i][1] === data.memberId) {
      sheet.deleteRow(i + 1);
      return { status: "left" };
    }
  }
  return { status: "not_found" };
}

// ── Get SOS alerts ────────────────────────────────────────
function getSOS(groupCode) {
  const sheet = getSheet(SHEET_NAME_MEMBERS);
  const rows  = sheet.getDataRange().getValues();
  const alerts = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === groupCode && (rows[i][7] === "TRUE" || rows[i][7] === true)) {
      alerts.push({ memberId: rows[i][1], name: rows[i][2] });
    }
  }
  return { alerts };
}
