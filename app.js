const express = require("express");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const data = {
  users: [],
  events: [],
  groups: [],
  discussions: [],
  messages: [],
  comments: [],
  albums: [],
  photos: [],
  polls: [],
  questions: [],
  pollResponses: [],
  tickets: [],
  ticketTypes: [],
  shoppingItems: []
};

const requiredFields = {
  users: ["firstName", "lastName", "email"],
  events: ["name", "description", "startDate", "endDate", "place", "coverPhoto", "visibility", "organizerIds", "participantIds"],
  groups: ["name", "description", "icon", "coverPhoto", "type", "membersCanPost", "membersCanCreateEvents", "memberIds", "adminIds"],
  discussions: [],
  messages: ["discussionId", "userId", "content"],
  comments: ["userId", "content"],
  albums: ["eventId", "name"],
  photos: ["albumId", "userId", "url"],
  polls: ["eventId", "organizerId", "name"],
  questions: ["pollId", "text", "options"],
  pollResponses: ["questionId", "participantId", "option"],
  tickets: ["ticketTypeId", "firstName", "lastName", "email", "address", "purchaseDate"],
  ticketTypes: ["eventId", "name", "price", "quantity"],
  shoppingItems: ["eventId", "userId", "name", "quantity", "arrivalTime"]
};

function findById(resource, id) {
  return data[resource].find((item) => item.id === id);
}

function isEventMember(event, userId) {
  return event.organizerIds.includes(userId) || event.participantIds.includes(userId);
}

function canUseDiscussion(discussion, userId) {
  if (discussion.eventId) return isEventMember(findById("events", discussion.eventId), userId);
  const group = findById("groups", discussion.groupId);
  return group.memberIds.includes(userId) || group.adminIds.includes(userId);
}

function validate(item, resource, currentId) {
  for (const field of requiredFields[resource]) {
    if (item[field] === undefined || item[field] === null || item[field] === "") {
      return `${field} est obligatoire`;
    }
  }

  if (resource === "users" && data.users.some((user) => user.email === item.email && user.id !== currentId)) {
    return "Cette adresse email est déjà utilisée";
  }

  if (resource === "events") {
    if (!["public", "private"].includes(item.visibility)) return "visibility doit être public ou private";
    const startDate = new Date(item.startDate);
    const endDate = new Date(item.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) return "Les dates doivent être valides et endDate doit être après startDate";
    if (!Array.isArray(item.organizerIds) || item.organizerIds.length < 1) return "Il faut au moins un organisateur";
    if (!Array.isArray(item.participantIds)) return "participantIds doit être une liste";
    if (!item.organizerIds.every((id) => findById("users", id))) return "Un organisateur est introuvable";
    if (!item.participantIds.every((id) => findById("users", id))) return "Un participant est introuvable";
    if (item.groupId && !findById("groups", item.groupId)) return "Groupe introuvable";
  }

  if (resource === "groups") {
    if (!["public", "private", "secret"].includes(item.type)) return "type doit être public, private ou secret";
    if (!Array.isArray(item.memberIds) || item.memberIds.length < 1) return "Il faut au moins un membre";
    if (!Array.isArray(item.adminIds) || item.adminIds.length < 1) return "Il faut au moins un administrateur";
    if (!item.memberIds.every((id) => findById("users", id)) || !item.adminIds.every((id) => findById("users", id))) return "Un membre ou administrateur est introuvable";
  }

  if (resource === "discussions") {
    const hasGroup = Boolean(item.groupId);
    const hasEvent = Boolean(item.eventId);
    if (hasGroup === hasEvent) return "Une discussion doit être liée à un groupe ou à un événement, pas aux deux";
    if (hasGroup && !findById("groups", item.groupId)) return "Groupe introuvable";
    if (hasEvent && !findById("events", item.eventId)) return "Événement introuvable";
  }

  const references = {
    messages: [["discussionId", "discussions"], ["userId", "users"]],
    comments: [["userId", "users"]],
    albums: [["eventId", "events"]],
    photos: [["albumId", "albums"], ["userId", "users"]],
    polls: [["eventId", "events"], ["organizerId", "users"]],
    questions: [["pollId", "polls"]],
    pollResponses: [["questionId", "questions"], ["participantId", "users"]],
    tickets: [["ticketTypeId", "ticketTypes"]],
    ticketTypes: [["eventId", "events"]],
    shoppingItems: [["eventId", "events"], ["userId", "users"]]
  };

  for (const [field, target] of references[resource] || []) {
    if (!findById(target, item[field])) return `${field} ne correspond à aucun élément`;
  }

  if (resource === "messages" && !canUseDiscussion(findById("discussions", item.discussionId), item.userId)) {
    return "L'utilisateur ne fait pas partie de cette discussion";
  }

  if (resource === "comments") {
    const hasMessage = Boolean(item.messageId);
    const hasPhoto = Boolean(item.photoId);
    if (hasMessage === hasPhoto) return "Un commentaire doit viser un message ou une photo";
    if (hasMessage && !findById("messages", item.messageId)) return "Message introuvable";
    if (hasPhoto && !findById("photos", item.photoId)) return "Photo introuvable";
    if (hasMessage) {
      const message = findById("messages", item.messageId);
      if (!canUseDiscussion(findById("discussions", message.discussionId), item.userId)) return "L'utilisateur ne fait pas partie de cette discussion";
    }
    if (hasPhoto) {
      const photo = findById("photos", item.photoId);
      const album = findById("albums", photo.albumId);
      if (!isEventMember(findById("events", album.eventId), item.userId)) return "L'utilisateur ne participe pas à cet événement";
    }
  }

  if (resource === "questions" && (!Array.isArray(item.options) || item.options.length < 2)) return "Une question doit avoir au moins deux réponses possibles";
  if (resource === "photos") {
    const album = findById("albums", item.albumId);
    if (!isEventMember(findById("events", album.eventId), item.userId)) return "La photo doit être ajoutée par un participant ou un organisateur";
  }
  if (resource === "polls") {
    const event = findById("events", item.eventId);
    if (!event.organizerIds.includes(item.organizerId)) return "Le sondage doit être créé par un organisateur";
  }
  if (resource === "pollResponses") {
    const question = findById("questions", item.questionId);
    const poll = findById("polls", question.pollId);
    const event = findById("events", poll.eventId);
    if (!event.participantIds.includes(item.participantId)) return "L'utilisateur ne participe pas à cet événement";
    if (!question.options.includes(item.option)) return "Cette réponse n'existe pas pour la question";
    const alreadyAnswered = data.pollResponses.some((answer) => answer.questionId === item.questionId && answer.participantId === item.participantId && answer.id !== currentId);
    if (alreadyAnswered) return "Une réponse existe déjà pour cette question et ce participant";
  }
  if (resource === "ticketTypes" && (!Number.isFinite(Number(item.price)) || !Number.isInteger(Number(item.quantity)) || Number(item.price) < 0 || Number(item.quantity) < 1)) return "Le prix doit être positif ou nul et la quantité un entier supérieur à zéro";
  if (resource === "tickets") {
    const type = findById("ticketTypes", item.ticketTypeId);
    const event = findById("events", type.eventId);
    if (event.visibility !== "public") return "La billetterie est réservée aux événements publics";
    const sold = data.tickets.filter((ticket) => ticket.ticketTypeId === item.ticketTypeId && ticket.id !== currentId).length;
    if (sold >= type.quantity) return "Il n'y a plus de billet disponible pour ce type";
    if (data.tickets.some((ticket) => ticket.email === item.email && ticket.id !== currentId)) return "Cette personne possède déjà un billet";
  }
  if (resource === "shoppingItems") {
    const duplicate = data.shoppingItems.some((entry) => entry.eventId === item.eventId && entry.name.toLowerCase() === item.name.toLowerCase() && entry.id !== currentId);
    if (duplicate) return "Cet élément existe déjà pour cet événement";
    if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) return "La quantité doit être un entier supérieur à zéro";
  }

  return null;
}

app.get("/", (req, res) => {
  res.json({ message: "API My Social Networks", documentation: "Voir README.md et la collection Postman" });
});

for (const resource of Object.keys(data)) {
  app.get(`/api/${resource}`, (req, res) => {
    res.json(data[resource]);
  });

  app.get(`/api/${resource}/:id`, (req, res) => {
    const item = findById(resource, req.params.id);
    if (!item) return res.status(404).json({ message: "Élément introuvable" });
    res.json(item);
  });

  app.post(`/api/${resource}`, (req, res) => {
    const body = { ...req.body };
    if (resource === "events" && body.groupId) {
      const group = findById("groups", body.groupId);
      if (group) body.participantIds = [...new Set([...(body.participantIds || []), ...group.memberIds])];
    }
    const item = { ...body, id: String(Date.now()) + String(Math.floor(Math.random() * 1000)) };
    const error = validate(item, resource);
    if (error) return res.status(400).json({ message: error });
    data[resource].push(item);
    res.status(201).json(item);
  });

  app.put(`/api/${resource}/:id`, (req, res) => {
    const index = data[resource].findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ message: "Élément introuvable" });
    const item = { ...req.body, id: req.params.id };
    const error = validate(item, resource, req.params.id);
    if (error) return res.status(400).json({ message: error });
    data[resource][index] = item;
    res.json(item);
  });

  app.delete(`/api/${resource}/:id`, (req, res) => {
    const index = data[resource].findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ message: "Élément introuvable" });
    data[resource].splice(index, 1);
    res.status(204).send();
  });
}

app.use((err, req, res, next) => {
  res.status(400).json({ message: "Le JSON envoyé est invalide" });
});

app.listen(port, () => {
  console.log(`API démarrée sur http://localhost:${port}`);
});
