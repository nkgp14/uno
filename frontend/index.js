
var userName = "none";
var fbRef = firebase.database().ref();
var db = firebase.firestore();
var dbRef = fbRef.child('text');
var gameId = "";

gameId = "RnuCvj1lD9x4IUNagtJ1";
userName = $("#userName").val();


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


var batch = firebase.firestore;
console.log("batch is " + batch);

function newGame() {
    allReset();
    if ($("#userName").val() == null || $("#userName").val() == "") {
        window.alert("UserName must be entered");
        return;
    }

    userName = $("#userName").val();
    console.log("userName is " + userName);

    var batch = db.batch();
    var gameIdRef = db.collection("Games").doc();
    gameId = gameIdRef.id;
    console.log("Game id is " + gameIdRef.id);
    batch.set(gameIdRef.collection("Users").doc(userName), { "userName": userName });
    batch.set(db.collection("GameStatus").doc(gameId), { 'status': 'created' });
    batch.commit().then(docRef => {
        console.log("Document has been added " + userName);
        $('#CurrentGameId').text(gameId);
        postJoiningGame(gameId);
    });
}

function joinGame() {
    allReset();
    if ($("#userName").val() == null || $("#userName").val() == "") {
        window.alert("UserName must be entered");
        return;
    }
    userName = $("#userName").val();
    gameId = $("#gameId").val();
    if (gameId == null || gameId == "") {
        window.alert("To join a game, gameId must be entered.");
        return;
    } else {
        db.collection("GameStatus").doc(gameId).get().then(doc => {
            if (!doc.exists) {
                console.log("invalid game id " + gameId);
                window.alert("Invalid game id " + gameId);
            }
            // TODO check the stauts of the game and alert if game has started.
            db.collection("Games/" + gameId + "/Users").doc(userName).set({ "userName": userName }).then(docRef => {
                console.log("User has joined the game " + userName);
                $('#CurrentGameId').text(gameId);
                postJoiningGame(gameId);
            })
        });
    }
}

// Function to show list of users part of the current game
function currentUsers(gameId) {
    db.collection("Games/" + gameId + "/Users").onSnapshot(querySnapshot => {
        $("#UsersJoinedList").empty();
        querySnapshot.forEach(element => {
            console.log("Looping in game ids " + element.id);
            $("#UsersJoinedList").append("<li>" + element.id + "</li>");
        });
        $(".UsersJoined").css("display", "block");
    });
}

// Function to reset stuff, in case user presses newGame/joinGame
function allReset() {
    $("#StartGame").hide();
    $("#GameStarted").hide();
    $(".UsersJoined").hide();
}

// Function after a user joins a game
function postJoiningGame(gameId) {
    currentUsers(gameId);
    centerCard(gameId);
    $("#StartGame").css("display", "inline");
    // $("#GameStarted").css("display", "block");
    /* $('#Cards').prepend($('<img>',{id:'theImg',src:'cards/plus4.png', width: "100px",
    height: "150px", click: function() {
    playCard("plus4");
    }}));
    */
    db.collection("UserCards/" + userName + "/Game").doc(gameId).onSnapshot(querySnapshot => {
        $("#Cards").empty();
        $("#Deck").empty();
        if (querySnapshot.exists) {
            $('#Deck').prepend($('<img>', {
                id: 'deckImg', src: 'cards/uno.png', width: "100px",
                height: "150px", click: function () {
                    drawCards();
                }
            }));
            querySnapshot.data().cards.forEach(card => {
                console.log("card is " + card);
                $('#Cards').prepend($('<img>', {
                    id: 'cardImg', src: 'cards/' + card + '.png', width: "100px",
                    height: "150px", click: function () {
                        playCard(card);
                    }
                }));
            });
        }
        /* querySnapshot.forEach(element => {
            if (element.id === gameId) {
                console.log("printing fields");
                console.dir(element.data());
                // console.log("Looping in cards ids " + element.id + element.data().textDisplay);
                $("#Cards").append("<li>" + element.data().cards + "</li>");
            }
        }); */
    });
}

// Start the game by calling a cloud function
function startGame() {
    $.ajax({
        type: "GET",
        crossDomain: true,
        url: "https://us-central1-uno-game-7c34d.cloudfunctions.net/startGame?gameId=" + gameId,
        success: function (response) {
            console.log("it's a success woooo " + response);
        },
        error: function (xhr, textStatus, errorThrown) {
            window.alert("error");
        }
    });
}

function callbackT(param) {
    console.log("callback is called");
}

function centerCard(gameId) {
    db.collection("GameCards").doc(gameId).onSnapshot(doc => {
        if (doc.exists) {
            console.log("center " + doc.data().centerCard + " next " + doc.data().nextTurn);
            var card = doc.data().centerCard;
            if (card === 'plus4' || card === 'wild') {
                card = doc.data().color + card; 
            }
            $("#CenterCard").empty();
            $('#CenterCard').prepend($('<img>', {
                id: 'centerCardImg', src: 'cards/' + card + '.png', width: "100px",
                height: "150px",
            }));
            $("#NextTurn").text(doc.data().users[doc.data().nextTurn]);
            if (doc.data().winner) {
                $("#Winner").text(doc.data().winner + " is the winner !!!!");
            }
        }
    });
}

function playCard(playedCard) {
    var announcedColor = "";
    if (playedCard === 'plus4' || playedCard === 'wild') {
        announcedColor = window.prompt("Choose a color(r/b/y/g)!");
        if (announcedColor !== 'r' && announcedColor !== 'b' && announcedColor !== 'y' && announcedColor !== 'g') {
            window.alert("invalid color, try clicking again!");
            console.log("Invalid color entered");
        }
    }
    console.log("played " + playedCard + " color " + announcedColor);
    // var announcedColor = $("#announcedColor").val();
    $.ajax({
        type: "GET",
        crossDomain: true,
        url: "https://us-central1-uno-game-7c34d.cloudfunctions.net/playCard?gameId=" + gameId + "&userName=" + userName + "&card=" + playedCard + "&announcedColor=" + announcedColor,
        success: function (response) {
            console.log("it's a success playCard woooo " + response);
        },
        error: function (xhr, textStatus, errorThrown) {
            window.alert("error " + textStatus + errorThrown);
        }
    });
}


function drawCards() {
    $.ajax({
        type: "GET",
        crossDomain: true,
        url: "https://us-central1-uno-game-7c34d.cloudfunctions.net/drawCard?gameId=" + gameId + "&userName=" + userName,
        success: function (response) {
            console.log("it's a success playCard woooo " + response);
        },
        error: function (xhr, textStatus, errorThrown) {
            window.alert("error " + textStatus + errorThrown);
        }
    });
}

