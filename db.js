const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { shipments: [], messages: [], nextShipmentId: 1, nextMessageId: 1 };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getAllShipments() {
  const data = load();
  return [...data.shipments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function searchShipments(q) {
  const data = load();
  const like = q.toLowerCase();
  return data.shipments
    .filter(s => s.tracking_number.toLowerCase().includes(like) ||
                 s.sender_name.toLowerCase().includes(like) ||
                 s.receiver_name.toLowerCase().includes(like))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getShipmentByTN(tn) {
  const data = load();
  return data.shipments.find(s => s.tracking_number === tn) || null;
}

function createShipment(fields) {
  const data = load();
  const now = fields.timestamp || new Date().toISOString();
  const shipment = {
    id: data.nextShipmentId++,
    tracking_number: fields.trac
