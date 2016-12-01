// Some constant values that can and have been adjusted
var GAME_WIDTH = window.screen.width * window.devicePixelRatio;
var GAME_HEIGHT = window.screen.height * window.devicePixelRatio;
var GAME_SCALE = 3;
var GRAVITY = .2;
var DISTANCE_DIVISOR = 20;
var RUNNING_THRESHOLD = 2;
var COUNTDOWN_GAP = 60;
var ATTACK_TIME = 40;
var GAME_OVER_DELAY = 100;
var MUSIC_VOLUME = .1;
var SFX_VOLUME = .3;
var SPAWN_RATE_INCREASE = 0.06;
var GROUND_LEVEL = 3*GAME_HEIGHT/GAME_SCALE/4;

// Variables used for displaying and updating text
var currText = "";
var currTextTime = 0;
var text;

// Objects used to store important game info
var textures = {};
var sounds = {};
var keys = {};

// Variables that holds all of the potential game over screen texts and starting names
var goTexts = ["Whelp, they got'cha", "Maybe try running next time...", "C'mon smalls, you can do better than that", "RIP"];
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
var musicEnabled = true;
var sfxEnabled = true;

// Initialize tracking variables
var currDelay = 0;
var distance = 0;
var punchOuts = 0;
var finalScore = 0;
var gameTick = 0;
var currSong = Math.round(Math.random()*3)-1;
var spawnGap = 300;

// Variables having to do with the state machines in use
var currState = 0;
var currOptState = 2;
var menuState = StateMachine.create({
    initial: {state: "play", event: "init"},
    error: function() {},
    events: [
        {name: "down", from: "play", to: "instruct"},
        {name: "down", from: "instruct", to: "options"},
        {name: "down", from: "options", to: "credits"},
        {name: "down", from: "credits", to: "credits"},

        {name: "up", from: "play", to: "play"},
        {name: "up", from: "instruct", to: "play"},
        {name: "up", from: "options", to: "instruct"},
        {name: "up", from: "credits", to: "options"}],
    callbacks: {
        onplay: function() { movePointer(0); currState = 0; },
        oninstruct: function() { movePointer(1); currState = 1; },
        onoptions: function() { movePointer(2); currState = 2; },
        oncredits: function() { movePointer(3); currState = 3; },
    }
});
var optMenuState = StateMachine.create({
    initial: {state: "back", event: "init"},
    error: function() {},
    events: [
        {name: "down", from: "music", to: "sfx"},
        {name: "down", from: "sfx", to: "back"},
        {name: "down", from: "back", to: "back"},

        {name: "up", from: "music", to: "music"},
        {name: "up", from: "sfx", to: "music"},
        {name: "up", from: "back", to: "sfx"}],
    callbacks: {
        onmusic: function() { movePointer(0); currOptState = 0; },
        onsfx: function() { movePointer(1); currOptState = 1; },
        onback: function() { movePointer(2); currOptState = 2; },
    }
});

// Fetch gameport and add the renderer
var gameport = document.getElementById("gameport");
var renderer = new PIXI.autoDetectRenderer(GAME_WIDTH, GAME_HEIGHT, {backgroundColor: 0x000});
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
        return this.attackTime > 0
    },
    "inAir": function() {
        if (this.sprite.position.y < GROUND_LEVEL) return true;
        else return false;
    },
    "update": function() {

        // Update physics of player
        this.sprite.position.y += this.dy;
        if (this.sprite.position.y > GROUND_LEVEL) this.sprite.position.y = GROUND_LEVEL;
        this.dy += GRAVITY;

        // Update attack of player
        if (this.isAttacking()) {
            --this.attackTime;
            this.sprite.animationSpeed = 6/ATTACK_TIME;
            if (this.attackTime > ATTACK_TIME/3 && this.attackTime < 2*ATTACK_TIME/3) this.punching = true;
            else this.punching = false;
        }
        else {
            this.sprite.animationSpeed = this.dx/15 + .05;
        }
        

        // Idle animation
        if (this.dx === 0) {
            this.sprite.textures = textures.player.idle;
            // Different texture if jumping and still
            // if (this.inAir()) this.sprite.textures = textures.player.stillJump;
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
            "startX": GAME_WIDTH/GAME_SCALE,
            "startY": GROUND_LEVEL
        },
        "enemy2": {
            "dx": 0.3,
            "dy": 0,
            "jumpPower": 2.75,
            "startX": GAME_WIDTH/GAME_SCALE,
            "startY": GROUND_LEVEL
        },
        "enemy3": {
            "dx": -0.2,
            "dy": 0,
            "jumpPower": 0,
            "startX": GAME_WIDTH/GAME_SCALE,
            "startY": GROUND_LEVEL
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
            if (currSprite.position.y > GROUND_LEVEL) currSprite.position.y = GROUND_LEVEL, currSprite.dy = -currStats.jumpPower;
            currSprite.dy += GRAVITY;

            // Check to see if this enemy is inside of the punch hitbox while the player is punching
            if (((Math.abs(currSprite.position.x - player.sprite.position.x-player.sprite.width) * 2 < currSprite.width + 3*player.sprite.width/4) && (Math.abs(currSprite.position.y - player.sprite.position.y) * 2 < currSprite.height + player.sprite.height)) && player.punching) {
                playSound("punch");
                ++punchOuts;
                this.sprites.splice(this.sprites.indexOf(currSprite), 1);
                enemyCont.removeChild(currSprite);
            }

            // Check to see if this enemy has collided with the player
            if (((Math.abs(currSprite.position.x - player.sprite.position.x) * 2 < currSprite.width + player.sprite.width) && (Math.abs(currSprite.position.y - player.sprite.position.y) * 2 < currSprite.height + player.sprite.height)) && running) gameOver();

            // Update textures
            currSprite.animationSpeed = currStats.dx/20 + .05;

            if (currSprite.position.x < -currSprite.width) this.sprites.splice(i,1);
        }
    }
};

// Add event listeners to the document
document.addEventListener("keydown", keydownEventHandler);
document.addEventListener("keyup", keyupEventHandler);

// Create temporary loading text
ltext = new PIXI.Text("Loading ... edit high score name while you wait?",{font: "30px Arial", fill: "#fff"});
ltext.position.x = 10;
ltext.position.y = GAME_HEIGHT/GAME_SCALE-20;
ltext.scale.x = 1/GAME_SCALE;
ltext.scale.y = 1/GAME_SCALE;
stage.addChildAt(ltext, 0);
renderer.render(stage);
stage.removeChildAt(0);

// Ensure scaling doesn't cause anti-aliasing
PIXI.SCALE_MODES.DEFAULT = PIXI.SCALE_MODES.NEAREST;

// Add all assets to the loader
PIXI.loader
    .add("assets/spritesheet.json")
    .add("fonts/athletic-stroke.fnt")
    .add("fonts/athletic-stroke-small.fnt")
    .add("audio/music1.mp3")
    .add("audio/music2.mp3")
    .add("audio/music3.mp3")
    .add("audio/thump.mp3")
    .add("audio/success.mp3")
    .add("audio/defeat.mp3")
    .add("audio/woosh.mp3")
    .add("audio/punch.mp3")
    .add("audio/countdown1.mp3")
    .add("audio/countdown2.mp3")
    .add("audio/jump.mp3")
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

    // Load music
    sounds["music1"] = PIXI.audioManager.getAudio("audio/music1.mp3");
    sounds["music2"] = PIXI.audioManager.getAudio("audio/music2.mp3");
    sounds["music3"] = PIXI.audioManager.getAudio("audio/music3.mp3");

    // Load sound effects
    sounds["thump"] = PIXI.audioManager.getAudio("audio/thump.mp3");
    sounds["success"] = PIXI.audioManager.getAudio("audio/success.mp3");
    sounds["defeat"] = PIXI.audioManager.getAudio("audio/defeat.mp3");
    sounds["woosh"] = PIXI.audioManager.getAudio("audio/woosh.mp3");
    sounds["punch"] = PIXI.audioManager.getAudio("audio/punch.mp3");
    sounds["countdown1"] = PIXI.audioManager.getAudio("audio/countdown1.mp3");
    sounds["countdown2"] = PIXI.audioManager.getAudio("audio/countdown2.mp3");
    sounds["jump"] = PIXI.audioManager.getAudio("audio/jump.mp3");

    // Adjust volumes
    sounds.music1.volume = MUSIC_VOLUME;
    sounds.music2.volume = MUSIC_VOLUME;
    sounds.music3.volume = MUSIC_VOLUME;
    sounds.thump.volume = SFX_VOLUME;
    sounds.success.volume = SFX_VOLUME;
    sounds.defeat.volume = SFX_VOLUME;
    sounds.woosh.volume = SFX_VOLUME;
    sounds.punch.volume = SFX_VOLUME - .2;
    sounds.countdown1.volume = SFX_VOLUME;
    sounds.countdown2.volume = SFX_VOLUME;
    sounds.jump.volume = SFX_VOLUME;

    // Start the player off at the main menu and begin main game loop
    loadMainMenu(true);
    animate();
}

// Function used to create and display the starting menu
function loadMainMenu(first) {

    // Do not play change screen noise if the player has just started the game
    if (first != true) playSound("success");
    
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
    background.width = GAME_WIDTH/GAME_SCALE;
    background.height = GAME_HEIGHT/GAME_SCALE;
    menu.addChild(background);

    title = new PIXI.extras.BitmapText("Punch Line",{font: "58px athletic-stroke", align: "center"});
    title.scale.x = 1/GAME_SCALE;
    title.scale.y = 1/GAME_SCALE;
    title.position.x = GAME_WIDTH/GAME_SCALE/2 - title.width/2;
    title.position.y = GAME_HEIGHT/GAME_SCALE/4 - title.height/2;
    menu.addChild(title);

    play = new PIXI.extras.BitmapText("Play Game",{font: "36px athletic-stroke-small", align: "center"});
    play.scale.x = 1/GAME_SCALE;
    play.scale.y = 1/GAME_SCALE;
    play.interactive = true, play.buttonMode = true;
    play.on("mousedown", startGame), play.on("mouseover", menuHover), play.action = startGame;
    play.position.x = GAME_WIDTH/GAME_SCALE/2 - play.width/2;
    play.position.y = title.position.y + GAME_HEIGHT/GAME_SCALE/6;
    menu.addChild(play);

    instruct = new PIXI.extras.BitmapText("Instructions",{font: "36px athletic-stroke-small", align: "center"});
    instruct.scale.x = 1/GAME_SCALE;
    instruct.scale.y = 1/GAME_SCALE;
    instruct.interactive = true, instruct.buttonMode = true;
    instruct.on("mousedown", loadInstructions), instruct.on("mouseover", menuHover), instruct.action = loadInstructions;
    instruct.position.x = GAME_WIDTH/GAME_SCALE/2 - instruct.width/2;
    instruct.position.y = play.position.y + GAME_HEIGHT/GAME_SCALE/10;
    menu.addChild(instruct);

    options = new PIXI.extras.BitmapText("Options",{font: "36px athletic-stroke-small", align: "center"});
    options.scale.x = 1/GAME_SCALE;
    options.scale.y = 1/GAME_SCALE;
    options.interactive = true, options.buttonMode = true;
    options.on("mousedown", loadOptions), options.on("mouseover", menuHover), options.action = loadOptions;
    options.position.x = GAME_WIDTH/GAME_SCALE/2 - options.width/2;
    options.position.y = instruct.position.y + GAME_HEIGHT/GAME_SCALE/10;
    menu.addChild(options);

    credits = new PIXI.extras.BitmapText("Credits",{font: "36px athletic-stroke-small", align: "center"});
    credits.scale.x = 1/GAME_SCALE;
    credits.scale.y = 1/GAME_SCALE;
    credits.interactive = true, credits.buttonMode = true;
    credits.on("mousedown", loadCredits), credits.on("mouseover", menuHover), credits.action = loadCredits;
    credits.position.x = GAME_WIDTH/GAME_SCALE/2 - credits.width/2;
    credits.position.y = options.position.y + GAME_HEIGHT/GAME_SCALE/10;
    menu.addChild(credits);

    pointer = new PIXI.Sprite(textures.pointer);
    pointer.position.x = menu.getChildAt(currState+2).position.x - pointer.width - 10;
    pointer.position.y = menu.getChildAt(currState+2).position.y;
    menu.addChild(pointer);
    stage.addChild(menu);
}

// Function to manage menu hover change
function menuHover(e){
    targI = menu.children.indexOf(e.target);
    if (atMainMenu) {
        diff = targI-(currState+2);
        for (var i = 0; i < Math.abs(diff); i++) {
            if (diff < 0) menuState.up();
            else menuState.down();
        }
    }
    else {
        diff = targI-(currOptState+2);
        for (var i = 0; i < Math.abs(diff); i++) {
            if (diff < 0) optMenuState.up();
            else optMenuState.down();
        }
    }
    
}

// Function responsible for changing the location of the pointer, called by state machine
function movePointer(index) {
    playSound("thump");
    elem = menu.getChildAt(index+2);
    createjs.Tween.removeTweens(pointer.position);
    createjs.Tween.get(pointer.position).to({y: elem.position.y, x: elem.position.x - pointer.width - 10}, 500, createjs.Ease.cubicOut);
}

// Function to create and display the instructions menu screen
function loadInstructions() {

    playSound("success");

    // Reset game state variables and wipe the screen
    clearStage();
    atMainMenu = false;

    // Create instructions menu
    menu = new PIXI.Container();
    background = new PIXI.Sprite(textures.mainMenu);
    background.width = GAME_WIDTH/GAME_SCALE;
    background.height = GAME_HEIGHT/GAME_SCALE;
    menu.addChild(background);

    title = new PIXI.extras.BitmapText("Instructions",{font: "58px athletic-stroke", align: "center"});
    title.scale.x = 1/GAME_SCALE;
    title.scale.y = 1/GAME_SCALE;
    title.position.x = 10;
    title.position.y = 10;
    menu.addChild(title);

    infoText = new PIXI.extras.BitmapText("Press 'space', 'w', or 'up arrow' to jump\n\nPress 'esc' to pause the game\n\nPress 'enter' to punch baddies in front of you\n\nTiming on your punch is critical, you can't\njust throw a perfect punch while running\nfull-speed you silly goose",{font: "36px athletic-stroke-small", align: "center"});
    infoText.scale.x = 1/GAME_SCALE;
    infoText.scale.y = 1/GAME_SCALE;
    infoText.position.x = GAME_WIDTH/GAME_SCALE/2 - infoText.width/2;
    infoText.position.y = 20 + GAME_HEIGHT/GAME_SCALE/8;
    menu.addChild(infoText);

    back = new PIXI.extras.BitmapText("Back",{font: "36px athletic-stroke-small", align: "center"});
    back.scale.x = 1/GAME_SCALE;
    back.scale.y = 1/GAME_SCALE;
    back.interactive = true, back.buttonMode = true;
    back.on("mousedown", loadMainMenu), back.action = loadMainMenu;
    back.position.x = GAME_WIDTH/GAME_SCALE - back.width - 10;
    back.position.y = GAME_HEIGHT/GAME_SCALE - 3*back.height/2;
    menu.addChild(back);

    pointer = new PIXI.Sprite(textures.pointer);
    pointer.position.x = back.position.x - pointer.width - 10;
    pointer.position.y = back.position.y;
    menu.addChild(pointer);
    stage.addChild(menu);
}

// Function to create and display the options menu screen
function loadOptions() {

    playSound("success");

    // Reset game state variables and wipe the screen
    clearStage();
    atMainMenu = false;
    atOpt = true;

    // Create options menu
    menu = new PIXI.Container();
    background = new PIXI.Sprite(textures.mainMenu);
    background.width = GAME_WIDTH/GAME_SCALE;
    background.height = GAME_HEIGHT/GAME_SCALE;
    menu.addChild(background);

    title = new PIXI.extras.BitmapText("Options",{font: "58px athletic-stroke", align: "center"});
    title.scale.x = 1/GAME_SCALE;
    title.scale.y = 1/GAME_SCALE;
    title.position.x = 10;
    title.position.y = 10;
    menu.addChild(title);

    option1 = new PIXI.extras.BitmapText((musicEnabled) ? "Music: On" : "Music: Off",{font: "36px athletic-stroke-small", align: "center"});
    option1.scale.x = 1/GAME_SCALE;
    option1.scale.y = 1/GAME_SCALE;
    option1.interactive = true, option1.buttonMode = true;
    option1.on("mousedown", toggleMusic), option1.on("mouseover", menuHover), option1.action = toggleMusic;
    option1.position.x = GAME_WIDTH/GAME_SCALE/2 - option1.width/2;
    option1.position.y = 20 + GAME_HEIGHT/GAME_SCALE/8;
    menu.addChild(option1);

    option2 = new PIXI.extras.BitmapText((sfxEnabled) ? "SFX: On" : "SFX: Off",{font: "36px athletic-stroke-small", align: "center"});
    option2.scale.x = 1/GAME_SCALE;
    option2.scale.y = 1/GAME_SCALE;
    option2.interactive = true, option2.buttonMode = true;
    option2.on("mousedown", toggleSFX), option2.on("mouseover", menuHover), option2.action = toggleSFX;
    option2.position.x = GAME_WIDTH/GAME_SCALE/2 - option2.width/2;
    option2.position.y = option1.position.y + GAME_HEIGHT/GAME_SCALE/8;
    menu.addChild(option2);

    back = new PIXI.extras.BitmapText("Back",{font: "36px athletic-stroke-small", align: "center"});
    back.scale.x = 1/GAME_SCALE;
    back.scale.y = 1/GAME_SCALE;
    back.interactive = true, back.buttonMode = true;
    back.on("mousedown", loadMainMenu), back.on("mouseover", menuHover), back.action = loadMainMenu;
    back.position.x = GAME_WIDTH/GAME_SCALE - back.width - 10;
    back.position.y = GAME_HEIGHT/GAME_SCALE - 3*back.height/2;
    menu.addChild(back);

    pointer = new PIXI.Sprite(textures.pointer);
    pointer.position.x = menu.getChildAt(currOptState+2).position.x - pointer.width - 10;
    pointer.position.y = menu.getChildAt(currOptState+2).position.y;
    menu.addChild(pointer);
    stage.addChild(menu);
}

// Function to create and display the credits menu screen
function loadCredits() {

    playSound("success");

    // Reset game state variables and wipe the screen
    clearStage();
    atMainMenu = false;

    // Create credits menu
    menu = new PIXI.Container();
    background = new PIXI.Sprite(textures.mainMenu);
    background.width = GAME_WIDTH/GAME_SCALE;
    background.height = GAME_HEIGHT/GAME_SCALE;
    menu.addChild(background);

    title = new PIXI.extras.BitmapText("Credits:",{font: "58px athletic-stroke", align: "center"});
    title.scale.x = 1/GAME_SCALE;
    title.scale.y = 1/GAME_SCALE;
    title.position.x = 10;
    title.position.y = 10;
    menu.addChild(title);

    infoText = new PIXI.extras.BitmapText("Design and Storyboarding: Peter Huettl\n\nMusic and Sound: Peter Huettl\n\nProgramming: Peter Huettl\n\nArt: Peter Huettl",{font: "36px athletic-stroke-small", align: "center"});
    infoText.scale.x = 1/GAME_SCALE;
    infoText.scale.y = 1/GAME_SCALE;
    infoText.position.x = GAME_WIDTH/GAME_SCALE/2 - infoText.width/2;
    infoText.position.y = 20 + GAME_HEIGHT/GAME_SCALE/8;
    menu.addChild(infoText);

    back = new PIXI.extras.BitmapText("Back",{font: "36px athletic-stroke-small", align: "center"});
    back.scale.x = 1/GAME_SCALE;
    back.scale.y = 1/GAME_SCALE;
    back.interactive = true, back.buttonMode = true;
    back.on("mousedown", loadMainMenu), back.action = loadMainMenu;
    back.position.x = GAME_WIDTH/GAME_SCALE - back.width - 10;
    back.position.y = GAME_HEIGHT/GAME_SCALE - 3*back.height/2;
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
    skyBack.width = 2*GAME_WIDTH/GAME_SCALE;
    skyBack.height = 3*GAME_HEIGHT/GAME_SCALE/4;
    backgrounds.addChild(skyBack);

    distantBack = new PIXI.Sprite(textures.distantBack);
    distantBack.position.x = 0;
    distantBack.position.y = 0;
    distantBack.width = 2*GAME_WIDTH/GAME_SCALE;
    distantBack.height = 3*GAME_HEIGHT/GAME_SCALE/4;
    backgrounds.addChild(distantBack);

    console.log(distantBack.height);
    console.log(textures.distantBack.height);

    closeBack = new PIXI.Sprite(textures.closeBack);
    closeBack.position.x = 0;
    closeBack.position.y = 3*GAME_HEIGHT/GAME_SCALE/8;
    closeBack.width = 2*GAME_WIDTH/GAME_SCALE;
    closeBack.height = 3*GAME_HEIGHT/GAME_SCALE/8;
    backgrounds.addChild(closeBack);

    console.log(closeBack.height);
    console.log(textures.closeBack.height);

    floor = new PIXI.Sprite(textures.ground);
    floor.position.x = 0;
    floor.position.y = 3*GAME_HEIGHT/GAME_SCALE/4;
    floor.width = 2*GAME_WIDTH/GAME_SCALE;
    floor.height = GAME_HEIGHT/GAME_SCALE/4;
    backgrounds.addChild(floor);
    stage.addChild(backgrounds);

    enemyCont = new PIXI.Container();
    stage.addChild(enemyCont);

    // Initialize player sprite
    player.sprite = new PIXI.extras.MovieClip(textures.player.idle);
    player.sprite.anchor.y = 1;
    player.sprite.position.x = 20;
    player.sprite.position.y = 3*GAME_HEIGHT/GAME_SCALE/4;
    player.sprite.play();
    stage.addChild(player.sprite);

    distanceText = new PIXI.extras.BitmapText("Distance: 0 ft",{font: "28px athletic-stroke-small", align: "left"});
    distanceText.scale.x = 1/GAME_SCALE;
    distanceText.scale.y = 1/GAME_SCALE;
    distanceText.position.x = 5;
    distanceText.position.y = 5;
    stage.addChild(distanceText);

    punchText = new PIXI.extras.BitmapText("Punch-outs: 0",{font: "28px athletic-stroke-small", align: "left"});
    punchText.scale.x = 1/GAME_SCALE;
    punchText.scale.y = 1/GAME_SCALE;
    punchText.position.x = 5;
    punchText.position.y = 17;
    stage.addChild(punchText);

    pausedText = new PIXI.extras.BitmapText("Paused",{font: "36px athletic-stroke-small", align: "left"});
    pausedText.scale.x = 1/GAME_SCALE;
    pausedText.scale.y = 1/GAME_SCALE;
    pausedText.position.x = GAME_WIDTH/GAME_SCALE - 47;
    pausedText.position.y = GAME_HEIGHT/GAME_SCALE - 15;
    pausedText.visible = false;
    stage.addChild(pausedText);

    text = new PIXI.extras.BitmapText("",{font: "36px athletic-stroke-small", align: "center"});
    text.scale.x = 1/GAME_SCALE;
    text.scale.y = 1/GAME_SCALE;
    text.alpha = 0;
    stage.addChild(text);
}

/* BEGIN functions that have to do with updating game states */
function updateIntro() {
    if (gameTick === 0) displayText("3", COUNTDOWN_GAP), playSound("countdown1");
    if (gameTick === COUNTDOWN_GAP) displayText("2", COUNTDOWN_GAP), playSound("countdown1");
    if (gameTick === 2*COUNTDOWN_GAP) displayText("1", COUNTDOWN_GAP), playSound("countdown1");
    if (gameTick === 3*COUNTDOWN_GAP) {
        displayText("Go", COUNTDOWN_GAP);
        playSound("countdown2");
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
    text.position.x = (GAME_WIDTH/GAME_SCALE-text.width)/2;
    text.position.y = 20;
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
        currText += "\n\n\nPress space or enter to play again\n\nPress escape to return to the main menu";
    }
}
function updateMusic() {
    if (!sounds.music1.playing && !sounds.music2.playing && !sounds.music3.playing) {
        currSong = (currSong+1)%3;
        if (currSong === 0) sounds.music1.play();
        else if (currSong === 1) sounds.music2.play();
        else sounds.music3.play();
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

    playSound("defeat");

    playing = false;
    running = false;
    atGameOver = true;
    enemies.sprites = [];
    player.dx = 0;
    player.dy = 0;
    gameTick = 0;

    finalScore = Math.round((5*punchOuts+3*distance)/2);

    player.sprite.textures = textures.player.defeat;
    for (var i = 0; i < enemies.sprites.length; i++) enemies.sprites[i].stop();
    displayText("\n\n" + goTexts[Math.floor(Math.random()*goTexts.length)] + "\n\nYour final score, '" + finalScore + "', has been submitted", 0);
    postScore();
}
function clearStage() {
    while(stage.children[0]) {
        stage.removeChild(stage.children[0]);
    }
}
function playSound(name) {
    if (sfxEnabled) {
        sounds[name].stop();
        sounds[name].play();
    }
}
function toggleMusic() {
    musicEnabled = !musicEnabled;
    option1.text = (musicEnabled) ? "Music: On" : "Music: Off";
}
function toggleSFX() {
    sfxEnabled = !sfxEnabled;
    option2.text = (sfxEnabled) ? "SFX: On" : "SFX: Off";
}
function saveOptions() {
    name = document.getElementById("hs-input").value.replace(/[^\w\s]/gi, '');
    name = (startNames.indexOf(name) > -1) ? "" : name;
    settings = {
        "music": musicEnabled,
        "sfx": sfxEnabled,
        "hsName": name,
    }
    localStorage.setItem("settings", JSON.stringify(settings));
}
function fetchOptions() {
    if (localStorage.settings) {
        settings = JSON.parse(localStorage.settings);
        musicEnabled = settings.music;
        sfxEnabled = settings.sfx;
        document.getElementById("hs-input").value = (settings.hsName) ? settings.hsName : startNames[Math.floor(Math.random()*startNames.length)];
    }
}
/* END functions that have to do with doing completing distinct, finite processes */

/* BEGIN event handler functions */
function keydownEventHandler(e) {

    if (!focusedGame) return
    keys[e.which] = true;

    if (inMenu) {
        if (e.which === 87 || e.which === 38) {
            if (atOpt) optMenuState.up();
            else if (atMainMenu) menuState.up();
        }
        else if (e.which === 83 || e.which === 40) { 
            if (atOpt) optMenuState.down();
            else if (atMainMenu) menuState.down();
        }
        else if ((e.which === 27 || e.which === 13 || e.which === 32) && !atMainMenu && !atOpt) loadMainMenu();
        else if (e.which === 13 || e.which === 32) { 
            if (atMainMenu) menu.getChildAt(currState+2).action(); 
            else if (atOpt) {
                playSound("success");
                menu.getChildAt(currOptState+2).action(); 
            }
        }
    }
    else {
        if ((e.which === 32 || e.which === 87 || e.which === 38) && !player.inAir()) {
            playSound("jump");
            player.dy = -player.jumpPower;
        }
        if (e.which === 13 && !player.isAttacking() && running) {
            playSound("woosh");
            player.attackTime = ATTACK_TIME;
        }
        if (e.which === 27) {
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
        if ((e.which === 13 || e.which === 32) && restartable) startGame();
        if ((e.which === 27 || e.which === 8) && restartable) loadMainMenu();
    }
    
    if([32, 37, 38, 39, 40].indexOf(e.which) > -1) {
        e.preventDefault();
    }
}
function keyupEventHandler(e) {
    keys[e.which] = false;
}
function focusEventHandler(e) {
    focusedGame = false;
    input = document.getElementById("hs-input");
    if (startNames.indexOf(input.value) > -1) input.select();
}
function blurEventHandler(e) {
    focusedGame = true;
}
/* END event handler functions */

// Main game loop!
function animate() {
    requestAnimationFrame(animate);

    // Deal with music changing
    if (musicEnabled) updateMusic();
    else sounds.music1.stop(), sounds.music2.stop(), sounds.music3.stop();

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