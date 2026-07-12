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
    tracking_number: fields.tracking_number,
    sender_name: fields.sender_name,
    sender_email: fields.sender_email || '',
    receiver_name: fields.receiver_name,
    receiver_email: fields.receiver_email || '',
    origin: fields.origin,
    destination: fields.destination,
    weight: fields.weight || null,
    service: fields.service || '',
    eta: fields.eta || '',
    status: 'Registered',
    notes: fields.notes || '',
    created_at: now,
    events: [{
      status: 'Registered',
      location: fields.origin,
      note: fields.notes || '',
      created_at: now
    }]
  };
  data.shipments.push(shipment);
  save(data);
  return shipment;
}

function addShipmentEvent(tn, { status, location, note, timestamp }) {
  const data = load();
  const shipment = data.shipments.find(s => s.tracking_number === tn);
  if (!shipment) return null;
  const now = timestamp || new Date().toISOString();
  shipment.status = status;
  shipment.events.push({ status, location: location || shipment.destination, note: note || '', created_at: now });
  save(data);
  return shipment;
}

function deleteShipment(tn) {
  const data = load();
  data.shipments = data.shipments.filter(s => s.tracking_number !== tn);
  save(data);
}

function getStats() {
  const data = load();
  const total = data.shipments.length;
  const inTransit = data.shipments.filter(s => s.status === 'In Transit' || s.status === 'Out for Delivery').length;
  const delivered = data.shipments.filter(s => s.status === 'Delivered').length;
  const flagged = data.shipments.filter(s => s.status === 'Delayed' || s.status === 'Exception').length;
  return { total, inTransit, delivered, flagged };
}

function getMessages(direction) {
  const data = load();
  return data.messages
    .filter(m => m.direction === direction)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getMessageById(id) {
  const data = load();
  return data.messages.find(m => m.id === Number(id)) || null;
}

function createMessage(fields) {
  const data = load();
  const message = {
    id: data.nextMessageId++,
    direction: fields.direction,
    from_email: fields.from_email || '',
    to_email: fields.to_email || '',
    subject: fields.subject || '',
    body: fields.body || '',
    related_tracking: fields.related_tracking || null,
    is_read: 0,
    created_at: new Date().toISOString()
  };
  data.messages.push(message);
  save(data);
  return message;
}

function markMessageRead(id) {
  const data = load();
  const m = data.messages.find(m => m.id === Number(id));
  if (m) { m.is_read = 1; save(data); }
}

function getUnreadCount() {
  const data = load();
  return data.messages.filter(m => m.direction === 'inbox' && !m.is_read).length;
}

module.exports = {
  getAllShipments, searchShipments, getShipmentByTN, createShipment, addShipmentEvent,
  deleteShipment, getStats, getMessages, getMessageById, createMessage, markMessageRead,
  getUnreadCount
};
