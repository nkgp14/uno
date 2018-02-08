// import { event } from 'firebase-functions/lib/providers/analytics';

// const functions = require('firebase-functions');

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');
// Required for side-effects
// require("firebase/firestore");

// UNO game card types
const wildCards = {
  'plus4': 4, 'wild': 4,
}
const colorCards = {
  'skip': 2, 'reverse': 2, 'plus2': 2, '0': 2,
  '1': 2, '2': 2, '3': 2, '4': 2, '5': 2, '6': 2, '7': 2, '8': 2, '9': 2,
}
const colors = ['r', 'y', 'b', 'g'];

// The Firebase Admin SDK to access the Firebase Realtime Database. 
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
const BAD_REQUEST = 400;


function isAllowed(centerCard, playedCard, drawExtra, color) {
  var playedCardColor = playedCard[0];
  var centerCardColor = centerCard[0];
  var extra = 0;
  var playedCardNumber = playedCard.slice(1);
  var centerCardNumber = centerCard.slice(1);

  if (drawExtra === 0) {
    // there is nothing pending like +4 or +2
    // wild cards can be played without any issue.
    // for other cards if color is present then color should match
    // otherwise centerCard color should match or
    // the center card number should match.
    if (playedCard === 'plus4') {
      return [true, 4]
    } else if (playedCard === 'wild') {
      return [true, 0];
    } else if (color !== "") {
      // announced color is present hence need to follow that
      if (playedCardColor === color) {
        if (playedCard.endsWith('plus2')) {
          return [true, 2];
        } else {
          return [true, 0];
        }
      } else {
        return [false, 0];
      }
    } else {
      // there is no announced color hence center card matching is required either by color or number
      if (playedCardColor === centerCardColor) {
        if (playedCard.endsWith('plus2')) {
          return [true, 2];
        } else {
          return [true, 0];
        }
      } else if (playedCardNumber === centerCardNumber) {
        if (playedCard.endsWith('plus2')) {
          return [true, 2];
        } else {
          return [true, 0];
        }
      } else {
        return [false, 0];
      }
    }
  } else {
    // only limited cards can be played, it means center card could only be plus2 or plus4
    if (centerCard === 'plus4') {
      if (playedCard === 'plus4') {
        return [true, drawExtra + 4];
      } else {
        return [false, 0];
      }
    } else if (centerCard.endsWith('plus2')) {
      if (playedCard.endsWith('plus2')) {
        return [true, drawExtra + 2];
      } else {
        return [false, 0];
      }
    } else {
      console.log("something went wrong ");
    }
  }
}


// Take the text parameter passed to this HTTP endpoint and insert it into the
// Realtime Database under the path /messages/:pushId/original
exports.addMessage = functions.https.onRequest((req, res) => {
  // Grab the text parameter.
  const original = req.query.text;
  // Push the new message into the Realtime Database using the Firebase Admin SDK.
  var databaseRef = admin.database().ref('/messages')
  databaseRef.push({ original: original }).then(snapshot => {
    // Redirect with 303 SEE OTHER to the URL of the pushed object in the Firebase console.
    return res.redirect(303, snapshot.ref);
  }).catch(e => { console.log(e) });
});

exports.playCard = functions.https.onRequest((req, res) => {
  const gameId = req.query.gameId;
  const userName = req.query.userName;
  const playedCard = req.query.card;
  const announcedColor = req.query.announcedColor;
  console.log("DrawCard game " + gameId + " userName " + userName);
  res = res.set('Access-Control-Allow-Origin', '*');
  var db = admin.firestore();

  // check the turn if it doesn't match with the username then fail
  // validate inputs like announced color etc.
  return db.collection("GameCards").doc(gameId).get().then(doc => {
    if (!doc.exists) {
      console.log("Not a valid game Id " + gameId);
      return res.status(BAD_REQUEST).send("Not valid game id " + gameId + " userName " + userName);
    }
    if (doc.data().users[doc.data().nextTurn] !== userName) {
      console.log("Not your turn " + gameId + " user " + userName);
      return res.status(BAD_REQUEST).send("Not your turn " + gameId + " userName " + userName);
    }

    // check the card played by the user is valid or not
    return db.collection("UserCards").doc(userName).collection("Game").doc(gameId).get().then(userDoc => {
      if (!userDoc.exists) {
        console.log("UserDoc doesn't exist for this game " + gameId + " userName " + userName);
        return res.status(BAD_REQUEST).send("UserDoc doesn't exist " + gameId + " userName " + userName);
      }

      var userCards = userDoc.data().cards;
      var cardIndex = userCards.indexOf(playedCard);
      if (cardIndex === -1) {
        console.log("Invalid card " + userName + " " + playedCard);
        return res.status(BAD_REQUEST).send("Invalid card " + gameId + " userName " + userName + " playedCard " + playedCard);
      }

      // TODO put the validations, whether this card can be played or not
      var allowed = isAllowed(doc.data().centerCard, playedCard, doc.data().drawExtra, doc.data().color);
      if (!allowed[0]) {
        console.log("It's not a valid move " + doc.data().centerCard + " " + playedCard);
        return res.status(BAD_REQUEST).send("Not a valid move " + gameId + " userName " + userName + " playedCard " + playedCard);
      }

      // TODO get the color if it's a wild card
      var centerColor = "";
      var nextTurn = (doc.data().nextTurn + 1) % doc.data().users.length;
      if (playedCard === 'plus4' || playedCard === 'wild') {
        centerColor = announcedColor;
      } else if (playedCard.endsWith('skip')) {
        nextTurn = (nextTurn + 1) % doc.data().users.length;
      } else if (playedCard.endsWith('reverse')) {
        nextTurn = doc.data().nextTurn - 1;
        if (nextTurn === -1) {
          nextTurn = doc.data().users.length - 1;
        }
      } else {
        // ignore 
      }

      // delete the card from the users cards
      userCards.splice(cardIndex, 1);
      var drawExtra = allowed[1];
      var winner = "";
      if (userCards.length === 0) {
        winner = userName;
      }

      // update the center card and the next turn and the user cards.
      var batch = db.batch();
      batch.set(db.collection("UserCards").doc(userName).collection("Game").doc(gameId), { 'cards': userCards });
      var cardCountByUser = doc.data().cardCountByUser;
      cardCountByUser[userName] = userCards.length;

      var gameCardsDoc = {
        "nextTurn": nextTurn,
        "centerCard": playedCard,
        "drawExtra": drawExtra,
        "color": centerColor,
        "winner": winner,
        "cardCountByUser": cardCountByUser};
      batch.update(db.collection("GameCards").doc(gameId), gameCardsDoc);

      return batch.commit().then(batchRef => {
        console.log("PlayCard is all good");
        return res.end();
      });
    });
  });
});

exports.drawCard = functions.https.onRequest((req, res) => {
  const gameId = req.query.gameId;
  const userName = req.query.userName;
  console.log("DrawCard game " + gameId + " userName " + userName);
  res = res.set('Access-Control-Allow-Origin', '*');
  var db = admin.firestore();


  // check the turn if it doesn't match with the username then fail
  return db.collection("GameCards").doc(gameId).get().then(doc => {
    if (!doc.exists) {
      console.log("Not a valid game Id " + gameId);
      return res.status(BAD_REQUEST).send("Not a valid game Id " + gameId);
    }
    if (doc.data().users[doc.data().nextTurn] !== userName) {
      console.log("Not your turn " + gameId + " user " + userName);
      return res.status(BAD_REQUEST).send("Not your turn " + gameId + " userName " + userName);
    }

    // valid turn and game id hence proceed
    // find how many cards user needs to draw
    var drawCards = 0;
    if (doc.data().drawExtra) {
      drawCards = doc.data().drawExtra;
    } else {
      drawCards = 1;
    }

    console.log("Drawing " + drawCards);
    var newDeck = doc.data().deck;
    if (newDeck.length === 0) {
      return res.status(BAD_REQUEST).send("Deck is empty now!");
    }

    // update the turn and deck, also reset the draw related to plus4, plus2
    return db.collection("UserCards").doc(userName).collection("Game").doc(gameId).get().then(userDoc => {
      if (!userDoc.exists) {
        console.log("UserDoc doesn't exists for this game " + gameId + " userName " + userName);
        return res.status(BAD_REQUEST).send("UserDoc doesn't exists " + gameId + " userName " + userName);
      }

      var userCards = userDoc.data().cards;
      for (var i = 0; i < drawCards; i++) {
        var tempCard = newDeck.pop();
        userCards.push(tempCard);
        console.log("Drawed card " + tempCard);
        if (newDeck.length === 0) {
          return res.status(BAD_REQUEST).send("Deck is empty now!");
        }
      }

      var nextTurn = (doc.data().nextTurn + 1) % doc.data().users.length;
      var batch = db.batch();
      batch.set(db.collection("UserCards").doc(userName).collection("Game").doc(gameId), { 'cards': userCards });

      // Update user card count
      var cardCountByUser = doc.data().cardCountByUser;
      cardCountByUser[userName] = userCards.length;
      var gameCardsDoc =  {
        "deck": newDeck,
        "nextTurn": nextTurn,
        "drawExtra": 0,
        "cardCountByUser": cardCountByUser};
      batch.update(db.collection("GameCards").doc(gameId), gameCardsDoc);

      return batch.commit().then(batchRef => {
        console.log("Draw is all good");
        return res.end();
      });
    });
  });
});

exports.startGame = functions.https.onRequest((req, res) => {
  // Grab the text parameter
  const gameId = req.query.gameId;
  const BAD_REQUEST = 400;
  const CONFLICT = 409;
  const INTERNAL_SERVER_ERROR = 500;
  const SUCCESS = 200;
  var deck = []
  for (card in wildCards) {
    for (var count = 0; count < wildCards[card]; count++) {
      deck.push(card);
    }
  }
  for (card in colorCards) {
    for (var count1 = 0; count1 < colorCards[card]; count1++) {
      for (color of colors) {
        deck.push(color + card);
      }
    }
  }
  res = res.set('Access-Control-Allow-Origin', '*');

  // validate whether it's a valid game ID or not.
  // TODO check whether the game id is valid or not

  // get all users part of the game
  var db = admin.firestore();
  var users = [];
  return db.collection("Games/" + gameId + "/Users").get().then(querySnapshot => {
    querySnapshot.forEach(element => {
      console.log("Looping in game ids " + element.id);
      if (!users.includes(element.id)) {
        users.push(element.id);
      }
    });

    if (users.length < 2) {
      if (users.length === 0) {
        return res.status(BAD_REQUEST).send("Not a valid game Id " + gameId);
      }
      return res.status(BAD_REQUEST).send("Insufficient players");
    }

    return db.collection("GameStatus").doc(gameId).get().then(doc => {
      if (doc.exists && doc.data().status !== "created") {
        return res.status(CONFLICT).send("Game has already been started " + gameId);
      }

      // populate cards

      var batch = db.batch();
      console.log("game id is " + gameId + " users " + users);
      batch.update(db.collection("GameStatus").doc(gameId), { 'status': 'started' });

      // Shuffle the deck
      var currentIndex = deck.length, temporaryValue, randomIndex;

      // While there remain elements to shuffle...
      while (0 !== currentIndex) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = deck[currentIndex];
        deck[currentIndex] = deck[randomIndex];
        deck[randomIndex] = temporaryValue;
      }

      // for each user create an entry
      var deckIndex = 0;
      var userCards = [];
      var nextTurn = Math.floor(Math.random() * users.length);
      var nextTurnCounter = 0;
      var initialCardCount = 7;
      var cardCountByUser = {}
      for (var i = 0; i < 7; i++) {
        var counter = 0;
        for (let user of users) {
          nextTurnCounter += 1;
          if (i === 0) {
            userCards.push([]);
            cardCountByUser[user] = initialCardCount;
          }
          userCards[counter].push(deck.pop());
          counter++;
        }
      }

      console.log("before doing tempdeck deck size " + deck.length);
      var tempDeck = [];
      var centerCard = deck.pop();
      while (deck.length) {
        // TODO: support of swap card
        if (centerCard === 'plus4' || centerCard === 'wild') {
          tempDeck.push(centerCard);
          centerCard = deck.pop();
        } else {
          break;
        }
      }

      while (tempDeck.length) {
        deck.push(tempDeck.pop());
      }

      var drawExtra = 0;
      if (centerCard.includes("plus2")) {
        drawExtra = 2;
      }

      console.log("after doing tempdeck deck size " + deck.length);

      console.log("nextturn is " + nextTurn + " size " + users.size);

      var gameCardsDoc = {
        "centerCard": centerCard,
        "deck": deck,
        "nextTurn": nextTurn,
        "users": users,
        "cardCountByUser": cardCountByUser,
        "drawExtra": drawExtra,
        "color": "",
        "winner": ""};
      batch.set(db.collection("GameCards").doc(gameId), gameCardsDoc);

      console.log("userCards are " + userCards);
      counter = 0;
      for (let user of users) {
        batch.set(db.collection("UserCards").doc(user).collection("Game").doc(gameId), { 'cards': userCards[counter] });
        counter++;
      }

      return batch.commit().then(docRef => {
        console.log("all good");
        return res.end();
      });

    }).catch(error => {
      console.log("Error in getting GameStatus " + error);
    });
  }).catch(error => {
    console.log("Error getting document " + error);
    return res.status(BAD_REQUEST).end();
  });

});

function validateGameId(snapshot, gameId) {
  if (!snapshot.val()) {
    console.log("Not a valid game id " + gameId);
    return [false, res.status(BAD_REQUEST).send("Not a valid game Id " + gameId)];
  }
  if (snapshot.numChildren() < 2) {
    console.log("To start a game, need two users at least");
    return [false, res.status(BAD_REQUEST).send("Insufficient players")];
  }
  return [true, ""];
}

function populateCards(db, batch, users, gameId) {
  // Shuffle the deck
  var currentIndex = deck.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {
    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = deck[currentIndex];
    deck[currentIndex] = deck[randomIndex];
    deck[randomIndex] = temporaryValue;
  }

  // for each user create an entry
  var deckIndex = 0;
  var userCards = [];
  for (var i = 0; i < 7; i++) {
    var counter = 0;
    for (let user of users) {
      if (i === 0) {
        userCards.push([]);
      }
      userCards[counter].push(deck.pop());
      counter++;
    }
  }
  console.log("userCards are " + userCards);
  counter = 0;
  for (let user of users) {
    batch.set(db.collection("UserCards").collection(user).doc(gameId), { 'cards': userCards[counter] });
    counter++;
  }
}