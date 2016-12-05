document.addEventListener("deviceready", onDeviceReady, false);
window.addEventListener("orientationchange", function() { window.location.reload(true); }, true);

function onDeviceReady() {
    // Some constant values that can and have been adjusted
    const GAME_SCALE = 3;
    const GRAVITY = .2;
    const DISTANCE_DIVISOR = 20;
    const RUNNING_THRESHOLD = 2;
    const COUNTDOWN_GAP = 60;
    const GAME_TEXT_Y_OFFSET = 30;
    const PLAYER_X_OFFSET = 5;
    const ATTACK_TIME = 40;
    const PUNCH_BEGIN_DELAY = 0; // Percentage of beginning punch delay
    const PUNCH_END_DELAY = .33; // Percentage of end punch delay
    const GAME_OVER_DELAY = 100;
    const SPAWN_RATE_INCREASE = 0.06;
    const ENABLE_POINTER = false;

    // Tap control constants
    const SWIPE_DELAY = 300;
    const SWIPE_THRESHOLD = 115;
    const TAP_DELAY = 325;
    const TAP_THRESHOLD = 50;

    // Text sizes
    const MAIN_TITLE_SIZE = 46;
    const LARGE_LABEL_SIZE = 40;
    const MENU_TEXT_SIZE = 24;
    const GAME_STATS_SIZE = 22;
    const GAME_INFO_SIZE = 26;

    // Get game dimensions based off window
    var gameWidth = window.innerWidth;
    var gameHeight = window.innerHeight;
    var groundLevel = 3*gameHeight/GAME_SCALE/4;

    // Variables used for displaying and updating text
    var currText = "";
    var currTextTime = 0;
    var text;

    // Objects used to store important game info
    var textures = {};

    // Variables that holds all of the potential game over screen texts and starting names
    var goTexts = ["Whelp, got'cha", "Maybe try running...", "C'mon smalls", "RIP"];
    var startNames = ["Nameless Nancy", "NoName McGee", "Tike Myson", "Boxer 76"];

    // Booleans used to indicate the various states the game could be in
    var playing = false;
    var intro = false;
    var running = false;
    var inMenu = true;
    var atMainMenu = true;
    var atGameOver = false;
    var atOpt = false;
    var restartable = false;
    var focusedGame = true;

    // Initialize tracking variables
    var currDelay = 0;
    var distance = 0;
    var punchOuts = 0;
    var finalScore = 0;
    var gameTick = 0;
    var currSong = Math.round(Math.random()*3)-1;
    var spawnGap = 300;

    // Touch info
    var touchInfo = {
        startX: null,
        startY: null,
        startTime: null
    };

    // Fetch gameport and add the renderer
    var gameport = document.getElementById("gameport");
    var renderer = new PIXI.autoDetectRenderer(gameWidth, gameHeight, {backgroundColor: 0x000});
    gameport.appendChild(renderer.view);

    // Create the main stage
    var stage = new PIXI.Container();
    stage.scale.x = GAME_SCALE;
    stage.scale.y = GAME_SCALE;

    // Create the player object that has its own tracking variables and update function
    var player = {
        "sprite": null,
        "dx": 0,
        "dy": 0,
        "jumpPower": 5.25,
        "attackTime": 0,
        "punching": false,
        "isAttacking": function() {
            return this.attackTime > 0;
        },
        "inAir": function() {
            if (this.sprite.position.y < groundLevel) return true;
            else return false;
        },
        "update": function() {

            // Update physics of player
            this.sprite.position.y += this.dy;
            if (this.sprite.position.y > groundLevel) this.sprite.position.y = groundLevel;
            this.dy += GRAVITY;

            // Update attack of player
            if (this.isAttacking()) {
                --this.attackTime;
                this.sprite.animationSpeed = 6/ATTACK_TIME;
                if (this.attackTime < ATTACK_TIME - PUNCH_BEGIN_DELAY * ATTACK_TIME && this.attackTime > ATTACK_TIME * PUNCH_END_DELAY) this.punching = true;
                else this.punching = false;
            }
            else {
                this.sprite.animationSpeed = this.dx/15 + .05;
            }
            
            // Idle animation
            if (this.dx === 0) {
                this.sprite.textures = textures.player.idle;
            }
            // Walking animation
            else if (this.dx > 0 && this.dx < RUNNING_THRESHOLD) {
                if (this.isAttacking()) this.sprite.textures = textures.player.punching;
                else this.sprite.textures = textures.player.walking;
            }
            // Running animation
            else if (this.dx >= RUNNING_THRESHOLD) {
                if (this.isAttacking()) this.sprite.textures = textures.player.punching;
                else this.sprite.textures = textures.player.running;
            }

            if (this.attackTime === ATTACK_TIME-1) {
                this.sprite.gotoAndStop(0);
                this.sprite.play();
            }
        }
    };

    // Create the enemies object that has its own tracking variables and update function
    var enemies = {
        "sprites": [],
        "enemStats": {
            "enemy1": {
                "dx": 0,
                "dy": 0,
                "jumpPower": 0,
                "startX": gameWidth/GAME_SCALE,
                "startY": groundLevel
            },
            "enemy2": {
                "dx": 0.3,
                "dy": 0,
                "jumpPower": 2.75,
                "startX": gameWidth/GAME_SCALE,
                "startY": groundLevel
            },
            "enemy3": {
                "dx": -0.2,
                "dy": 0,
                "jumpPower": 0,
                "startX": gameWidth/GAME_SCALE,
                "startY": groundLevel
            }
        },
        "update": function() {
            for (var i = 0; i < this.sprites.length; i++) {

                // Get current enemy stats and sprite
                currSprite = this.sprites[i];
                currStats = this.enemStats[currSprite.type];
                if (!currSprite.dx) currSprite.dx = currStats.dx, currSprite.dy = currStats.dy;

                // Adjust position of sprite accounting for world physics
                currSprite.position.x -= player.dx - currSprite.dx;
                currSprite.position.y += currSprite.dy;
                if (currSprite.position.y > groundLevel) currSprite.position.y = groundLevel, currSprite.dy = -currStats.jumpPower;
                currSprite.dy += GRAVITY;

                // Check to see if this enemy is inside of the punch hitbox while the player is punching
                if (player.punching && ((Math.abs(currSprite.position.x - player.sprite.position.x-player.sprite.width) * 2 < currSprite.width + 3*player.sprite.width/4) && (Math.abs(currSprite.position.y - player.sprite.position.y) * 2 < currSprite.height + player.sprite.height))) {
                    ++punchOuts;
                    this.sprites.splice(this.sprites.indexOf(currSprite), 1);
                    enemyCont.removeChild(currSprite);
                }

                // Check to see if this enemy has collided with the player
                if (running && ((Math.abs(currSprite.position.x - player.sprite.position.x) * 2 < currSprite.width + player.sprite.width) && (Math.abs(currSprite.position.y - player.sprite.position.y) * 2 < currSprite.height + player.sprite.height))) gameOver();

                // Update textures
                currSprite.animationSpeed = currStats.dx/20 + .05;

                if (currSprite.position.x < -currSprite.width) this.sprites.splice(i,1);
            }
        }
    };

    // Add event listeners to the document
    document.addEventListener("touchstart", touchstartEventHandler);
    document.addEventListener("touchend", touchendEventHandler);

    // Create temporary loading text
    ltext = new PIXI.Text("Loading...",{font: "30px Arial", fill: "#fff"});
    ltext.position.x = 5;
    ltext.position.y = gameHeight/GAME_SCALE-15;
    ltext.scale.x = 1/GAME_SCALE;
    ltext.scale.y = 1/GAME_SCALE;
    stage.addChildAt(ltext, 0);
    renderer.render(stage);
    stage.removeChildAt(0);

    // Ensure scaling doesn't cause anti-aliasing
    PIXI.SCALE_MODES.DEFAULT = PIXI.SCALE_MODES.NEAREST;

    // Add all assets to the loader
    PIXI.loader
        .add("assets/test.json")
        .add("fonts/athletic-stroke.fnt")
        .add("fonts/athletic-stroke-small.fnt")
        .load(ready);

    // Kicks off main game preperation and set up
    function ready() {
        
        // Initialize player texture object
        textures["player"] = {
            "defeat": [],
            "idle": [],
            "walking": [],
            "running": [],
            "punching": []
        };

        // Loop through all frames of the player sprite
        for (var i = 1; i < 33; i++) {
            if (i <= 1) cont = "defeat";
            else if (i <= 11) cont = "idle";
            else if (i <= 17) cont = "walking";
            else if (i <= 26) cont = "running";
            else if (i <= 32) cont = "punching";
            
            textures.player[cont].push(PIXI.Texture.fromFrame("player" + i + ".png"));
        }

        // Initialize enemy texture object
        textures["enemies"] = {
            "enemy1": {
                "idle": [],
            },
            "enemy2": {
                "idle": [],
            },
            "enemy3": {
                "idle": [],
            }
        };

        // Loop through all frames of the enemy sprite
        for (var i = 1; i < 20; i++) {

            // Determine enemy who's sprite are being loaded
            if (i <= 9) outCont = "enemy1";
            else if (i <= 15) outCont = "enemy2";
            else if (i <= 19) outCont = "enemy3";

            // Determine which sprites are being loaded for each character
            if (i <= 9) cont = "idle";
            if (i <= 15) cont = "idle";
            if (i <= 19) cont = "idle";
            textures.enemies[outCont][cont].push(PIXI.Texture.fromFrame("enemies" + i + ".png"));
        }

        // Load relevant game textures
        textures["pointer"] = PIXI.Texture.fromFrame("pointer.png");
        textures["mainMenu"] = PIXI.Texture.fromFrame("main-menu.png");
        textures["skyBack"] = PIXI.Texture.fromFrame("sky-back.png");
        textures["distantBack"] = PIXI.Texture.fromFrame("distant-back.png");
        textures["closeBack"] = PIXI.Texture.fromFrame("close-back.png");
        textures["ground"] = PIXI.Texture.fromFrame("ground.png");

        // Start the player off at the main menu and begin main game loop
        loadMainMenu(true);
        animate();
    }

    // Function used to create and display the starting menu
    function loadMainMenu(first) {
        
        // Reset game state variables and wipe the screen
        clearStage();
        inMenu = true;
        atMainMenu = true;
        atGameOver = false;
        atOpt = false;
        restartable = false;

        // Create main menu
        menu = new PIXI.Container();
        background = new PIXI.Sprite(textures.mainMenu);
        background.width = gameWidth/GAME_SCALE;
        background.height = gameHeight/GAME_SCALE;
        menu.addChild(background);

        title = new PIXI.extras.BitmapText("Punch Line",{font: MAIN_TITLE_SIZE + "px athletic-stroke", align: "center"});
        title.scale.x = 1/GAME_SCALE;
        title.scale.y = 1/GAME_SCALE;
        title.position.x = gameWidth/GAME_SCALE/2 - title.width/2;
        title.position.y = gameHeight/GAME_SCALE/4 - title.height/2;
        menu.addChild(title);

        play = new PIXI.extras.BitmapText("Play Game",{font: MENU_TEXT_SIZE + "px athletic-stroke-small", align: "center"});
        play.scale.x = 1/GAME_SCALE;
        play.scale.y = 1/GAME_SCALE;
        play.interactive = true, play.buttonMode = true;
        play.on("mousedown", startGame), play.on("touchstart", startGame);
        play.action = startGame;
        play.position.x = gameWidth/GAME_SCALE/2 - play.width/2;
        play.position.y = title.position.y + gameHeight/GAME_SCALE/6;
        menu.addChild(play);

        instruct = new PIXI.extras.BitmapText("Instructions",{font: MENU_TEXT_SIZE + "px athletic-stroke-small", align: "center"});
        instruct.scale.x = 1/GAME_SCALE;
        instruct.scale.y = 1/GAME_SCALE;
        instruct.interactive = true, instruct.buttonMode = true;
        instruct.on("mousedown", loadInstructions), instruct.on("touchstart", loadInstructions);
        instruct.action = loadInstructions;
        instruct.position.x = gameWidth/GAME_SCALE/2 - instruct.width/2;
        instruct.position.y = play.position.y + gameHeight/GAME_SCALE/10;
        menu.addChild(instruct);

        credits = new PIXI.extras.BitmapText("Credits",{font: MENU_TEXT_SIZE + "px athletic-stroke-small", align: "center"});
        credits.scale.x = 1/GAME_SCALE;
        credits.scale.y = 1/GAME_SCALE;
        credits.interactive = true, credits.buttonMode = true;
        credits.on("mousedown", loadCredits), credits.on("touchstart", loadCredits);
        credits.action = loadCredits;
        credits.position.x = gameWidth/GAME_SCALE/2 - credits.width/2;
        credits.position.y = instruct.position.y + gameHeight/GAME_SCALE/10;
        menu.addChild(credits);

        pointer = new PIXI.Sprite(textures.pointer);
        pointer.position.x = play.position.x - pointer.width - 10;
        pointer.position.y = play.position.y;
        menu.addChild(pointer);
        stage.addChild(menu);
    }

    // Function responsible for changing the location of the pointer, called by state machine
    function movePointer(index) {
        elem = menu.getChildAt(index+2);
        createjs.Tween.removeTweens(pointer.position);
        createjs.Tween.get(pointer.position).to({y: elem.position.y, x: elem.position.x - pointer.width - 10}, 500, createjs.Ease.cubicOut);
    }

    // Function to create and display the instructions menu screen
    function loadInstructions() {

        // Reset game state variables and wipe the screen
        clearStage();
        atMainMenu = false;

        // Create instructions menu
        menu = new PIXI.Container();
        background = new PIXI.Sprite(textures.mainMenu);
        background.width = gameWidth/GAME_SCALE;
        background.height = gameHeight/GAME_SCALE;
        menu.addChild(background);

        title = new PIXI.extras.BitmapText("Instructions",{font: LARGE_LABEL_SIZE + "px athletic-stroke", align: "center"});
        title.scale.x = 1/GAME_SCALE;
        title.scale.y = 1/GAME_SCALE;
        title.position.x = gameWidth/GAME_SCALE/2 - title.width/2;
        title.position.y = 10;
        menu.addChild(title);

        infoText = new PIXI.extras.BitmapText("Swipe up to jump\n\nSwipe down to pause\n\nTap to punch baddies\n\nPunch timing is\ncritical,the tail end\nof your punch won't\nbe enough force",{font: MENU_TEXT_SIZE + "px athletic-stroke-small", align: "center"});
        infoText.scale.x = 1/GAME_SCALE;
        infoText.scale.y = 1/GAME_SCALE;
        infoText.position.x = gameWidth/GAME_SCALE/2 - infoText.width/2;
        infoText.position.y = 15 + gameHeight/GAME_SCALE/8;
        menu.addChild(infoText);

        back = new PIXI.extras.BitmapText("Back",{font: MENU_TEXT_SIZE + "px athletic-stroke-small", align: "center"});
        back.scale.x = 1/GAME_SCALE;
        back.scale.y = 1/GAME_SCALE;
        back.interactive = true, back.buttonMode = true;
        back.on("mousedown", loadMainMenu), back.on("touchstart", loadMainMenu), back.action = loadMainMenu;
        back.position.x = gameWidth/GAME_SCALE - back.width - 10;
        back.position.y = gameHeight/GAME_SCALE - 3*back.height/2;
        menu.addChild(back);

        pointer = new PIXI.Sprite(textures.pointer);
        pointer.position.x = back.position.x - pointer.width - 10;
        pointer.position.y = back.position.y;
        menu.addChild(pointer);
        stage.addChild(menu);
    }

    // Function to create and display the credits menu screen
    function loadCredits() {

        // Reset game state variables and wipe the screen
        clearStage();
        atMainMenu = false;

        // Create credits menu
        menu = new PIXI.Container();
        background = new PIXI.Sprite(textures.mainMenu);
        background.width = gameWidth/GAME_SCALE;
        background.height = gameHeight/GAME_SCALE;
        menu.addChild(background);

        title = new PIXI.extras.BitmapText("Credits",{font: LARGE_LABEL_SIZE + "px athletic-stroke", align: "center"});
        title.scale.x = 1/GAME_SCALE;
        title.scale.y = 1/GAME_SCALE;
        title.position.x = gameWidth/GAME_SCALE/2 - title.width/2;
        title.position.y = 10;
        menu.addChild(title);

        infoText = new PIXI.extras.BitmapText("Design: Peter H\n\nProgramming: Peter H\n\nArt: Peter H",{font: MENU_TEXT_SIZE + "px athletic-stroke-small", align: "center"});
        infoText.scale.x = 1/GAME_SCALE;
        infoText.scale.y = 1/GAME_SCALE;
        infoText.position.x = gameWidth/GAME_SCALE/2 - infoText.width/2;
        infoText.position.y = 15 + gameHeight/GAME_SCALE/8;
        menu.addChild(infoText);

        back = new PIXI.extras.BitmapText("Back",{font: MENU_TEXT_SIZE + "px athletic-stroke-small", align: "center"});
        back.scale.x = 1/GAME_SCALE;
        back.scale.y = 1/GAME_SCALE;
        back.interactive = true, back.buttonMode = true;
        back.on("mousedown", loadMainMenu), back.on("touchstart", loadMainMenu), back.action = loadMainMenu;
        back.position.x = gameWidth/GAME_SCALE - back.width - 10;
        back.position.y = gameHeight/GAME_SCALE - 3*back.height/2;
        menu.addChild(back);

        pointer = new PIXI.Sprite(textures.pointer);
        pointer.position.x = back.position.x - pointer.width - 10;
        pointer.position.y = back.position.y;
        menu.addChild(pointer);
        stage.addChild(menu);
    }

    // Function that creates the game screen and starts the game
    function startGame() {

        // Reset game state variables and wipe the screen
        clearStage();
        inMenu = false;
        atMainMenu = false;
        atGameOver = false;
        playing = true;
        restartable = false;
        intro = true;
        punchOuts = 0;
        distance = 0;
        finalScore = 0;
        gameTick = 0;
        currDelay = 0;
        spawnGap = 300;

        // Create a container for the parallax backgrounds
        backgrounds = new PIXI.Container();
        skyBack = new PIXI.Sprite(textures.skyBack);
        skyBack.position.x = 0;
        skyBack.position.y = 0;
        skyBack.width = 2*gameWidth/GAME_SCALE;
        skyBack.height = 3*gameHeight/GAME_SCALE/4;
        backgrounds.addChild(skyBack);

        distantBack = new PIXI.Sprite(textures.distantBack);
        distantBack.position.x = 0;
        distantBack.position.y = 0;
        distantBack.width = 2*gameWidth/GAME_SCALE;
        distantBack.height = 3*gameHeight/GAME_SCALE/4;
        backgrounds.addChild(distantBack);

        closeBack = new PIXI.Sprite(textures.closeBack);
        closeBack.position.x = 0;
        closeBack.position.y = 3*gameHeight/GAME_SCALE/8;
        closeBack.width = 2*gameWidth/GAME_SCALE;
        closeBack.height = 3*gameHeight/GAME_SCALE/8;
        backgrounds.addChild(closeBack);

        floor = new PIXI.Sprite(textures.ground);
        floor.position.x = 0;
        floor.position.y = 3*gameHeight/GAME_SCALE/4;
        floor.width = 2*gameWidth/GAME_SCALE;
        floor.height = gameHeight/GAME_SCALE/4;
        backgrounds.addChild(floor);
        stage.addChild(backgrounds);

        enemyCont = new PIXI.Container();
        stage.addChild(enemyCont);

        // Initialize player sprite
        player.sprite = new PIXI.extras.MovieClip(textures.player.idle);
        player.sprite.anchor.y = 1;
        player.sprite.position.x = PLAYER_X_OFFSET;
        player.sprite.position.y = 3*gameHeight/GAME_SCALE/4;
        player.sprite.play();
        stage.addChild(player.sprite);

        distanceText = new PIXI.extras.BitmapText("Distance: 0 ft",{font: GAME_STATS_SIZE + "px athletic-stroke-small", align: "left"});
        distanceText.scale.x = 1/GAME_SCALE;
        distanceText.scale.y = 1/GAME_SCALE;
        distanceText.position.x = 5;
        distanceText.position.y = 5;
        stage.addChild(distanceText);

        punchText = new PIXI.extras.BitmapText("Punch-outs: 0",{font: GAME_STATS_SIZE + "px athletic-stroke-small", align: "left"});
        punchText.scale.x = 1/GAME_SCALE;
        punchText.scale.y = 1/GAME_SCALE;
        punchText.position.x = 5;
        punchText.position.y = 17;
        stage.addChild(punchText);

        pausedText = new PIXI.extras.BitmapText("Paused",{font: GAME_STATS_SIZE + "px athletic-stroke-small", align: "left"});
        pausedText.scale.x = 1/GAME_SCALE;
        pausedText.scale.y = 1/GAME_SCALE;
        pausedText.position.x = gameWidth/GAME_SCALE - 35;
        pausedText.position.y = gameHeight/GAME_SCALE - 15;
        pausedText.visible = false;
        stage.addChild(pausedText);

        text = new PIXI.extras.BitmapText("",{font: GAME_INFO_SIZE + "px athletic-stroke-small", align: "center"});
        text.scale.x = 1/GAME_SCALE;
        text.scale.y = 1/GAME_SCALE;
        text.alpha = 0;
        stage.addChild(text);
    }

    /* BEGIN functions that have to do with updating game states */
    function updateIntro() {
        if (gameTick === 0) displayText("3", COUNTDOWN_GAP);
        if (gameTick === COUNTDOWN_GAP) displayText("2", COUNTDOWN_GAP);
        if (gameTick === 2*COUNTDOWN_GAP) displayText("1", COUNTDOWN_GAP);
        if (gameTick === 3*COUNTDOWN_GAP) {
            displayText("Go", COUNTDOWN_GAP);
            running = true;
            intro = false;
            gameTick = 0;
        }
    }
    function updateText() {
        if (--currTextTime === 0 || currText === "") {
            currText = "";
            text.alpha = 0;
        }

        text.text = currText;
        text.position.x = (gameWidth/GAME_SCALE-text.width)/2;
        text.position.y = GAME_TEXT_Y_OFFSET;
    }
    function updateBackgrounds() {
        sb = backgrounds.getChildAt(0);
        db = backgrounds.getChildAt(1);
        cb = backgrounds.getChildAt(2);
        f = backgrounds.getChildAt(3);

        sb.position.x -= player.dx * 0.05;
        db.position.x -= player.dx * 0.25;
        cb.position.x -= player.dx * 0.5;
        f.position.x -= player.dx * 1;

        if (Math.abs(sb.position.x) >= sb.width/2) sb.position.x = 0;
        if (Math.abs(db.position.x) >= db.width/2) db.position.x = 0;
        if (Math.abs(cb.position.x) >= cb.width/2) cb.position.x = 0;
        if (Math.abs(f.position.x) >= f.width/2) f.position.x = 0;
    }
    function updateGameState() {
        distanceText.text = "Distance: " + Math.floor(distance) + " ft";
        punchText.text = "Punch-outs: " + Math.floor(punchOuts);

        player.dx = Math.sqrt(gameTick)/18 + 0.1; // Function responsible for scaling up the player's speed

        if (gameTick % Math.floor(spawnGap) === 0) {
            spawnEnemy();
            spawnGap /= 1 + Math.random()*SPAWN_RATE_INCREASE;
        }
    }
    function updateGameOver() {
        if (++currDelay === GAME_OVER_DELAY) {
            restartable = true;
            currText += "\n\nTap to play again\n\nSwipe down to exit";
        }
    }
    /* END functions that have to do with updating game states */

    /* BEGIN functions that have to do with doing completing distinct, finite processes */
    function displayText(words, time) {
        text.alpha = 1;
        currText = words;
        if (time > 0) {
            currTextTime = time;
            createjs.Tween.removeTweens(text);
            createjs.Tween.get(text).to({alpha: 0}, 1000*time/60, createjs.Ease.quintIn);
        }
        else currTextTime = -1;
    }
    function spawnEnemy() {
        var result;
        var count = 0;
        for (var prop in enemies.enemStats) if (Math.random() < 1/++count) result = prop;

        newEnem = new PIXI.extras.MovieClip(textures.enemies[result].idle);
        newEnem.anchor.y = 1;
        newEnem.position.x = enemies.enemStats[result].startX;
        newEnem.position.y = enemies.enemStats[result].startY;
        newEnem.type = result;
        newEnem.play();
        enemies.sprites.push(newEnem);
        enemyCont.addChild(newEnem);
    }
    function gameOver() {

        playing = false;
        running = false;
        atGameOver = true;
        enemies.sprites = [];
        player.dx = 0;
        player.dy = 0;
        gameTick = 0;

        finalScore = Math.floor(distance) + punchOuts * 10;

        player.sprite.textures = textures.player.defeat;
        for (var i = 0; i < enemies.sprites.length; i++) enemies.sprites[i].stop();

        displayText("\n\n" + goTexts[Math.floor(Math.random()*goTexts.length)] + "\n\nFinal score: " + finalScore, 0);
    }
    function clearStage() {
        while(stage.children[0]) {
            stage.removeChild(stage.children[0]);
        }
    }
    /* END functions that have to do with doing completing distinct, finite processes */

    /* BEGIN event handler functions */
    function focusEventHandler(e) {
        focusedGame = false;
        input = document.getElementById("hs-input");
        if (startNames.indexOf(input.value) > -1) input.select();
    }
    function blurEventHandler(e) {
        focusedGame = true;
    }
    function touchstartEventHandler(e) {
        if (!inMenu) {
            var touch = e.changedTouches[0];
            touchInfo.startX = touch.pageX;
            touchInfo.startY = touch.pageY;
            touchInfo.startTime = new Date().getTime();
        }
    }
    function touchendEventHandler(e) {
        if (!inMenu) {
            var touch = e.changedTouches[0];
            var distY = touch.pageY - touchInfo.startY;
            var distX = touch.pageX - touchInfo.startX;
            var time = new Date().getTime() - touchInfo.startTime;

            // Swipe up conditional
            if (time <= SWIPE_DELAY && distY + SWIPE_THRESHOLD <= 0) {
                if (!player.inAir()) {
                    player.dy = -player.jumpPower;
                }
            }
            // Swipe down conditional
            else if (time <= SWIPE_DELAY && distY - SWIPE_THRESHOLD >= 0) {
                if (running) {
                    playing = !playing;
                    if (playing) {
                        pausedText.visible = false;
                        player.sprite.play();
                        for (var i = 0; i < enemies.sprites.length; i++) enemies.sprites[i].play();
                    }
                    else {
                        pausedText.visible = true;
                        player.sprite.stop();
                        for (var i = 0; i < enemies.sprites.length; i++) enemies.sprites[i].stop();
                    }
                }
                else if (restartable) loadMainMenu();
            }
            // Tap conditional
            else if (time <= TAP_DELAY && Math.abs(distX) <= TAP_THRESHOLD && Math.abs(distY) <= TAP_THRESHOLD) {
                if (!player.isAttacking() && running) {
                    player.attackTime = ATTACK_TIME;
                }
                else if (restartable) startGame();
            }
        }
    }
    /* END event handler functions */

    // Main game loop!
    function animate() {
        requestAnimationFrame(animate);

        // If there exists text, handle displaying it
        if (currText != "") updateText();

        // If the player is at the gameover screen, handle it
        if (atGameOver) updateGameOver();

        // If the user is playing
        if (playing) {
            
            if (intro) updateIntro();
            if (running) updateGameState();

            // Call individual player updates
            updateBackgrounds();
            player.update();
            enemies.update();

            // Increment tracking variables
            distance += player.dx/DISTANCE_DIVISOR, ++gameTick;
        }

        renderer.render(stage);
    }
}
