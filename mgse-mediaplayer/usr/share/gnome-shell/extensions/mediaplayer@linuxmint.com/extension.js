/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;
const DBus = imports.dbus;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Main = imports.ui.main;
const Panel = imports.ui.panel;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const GLib = imports.gi.GLib;
const Tweener = imports.ui.tweener;

const Gettext = imports.gettext.domain('gnome-shell-extension-mediaplayer');
const _ = Gettext.gettext;

const PropIFace = {
    name: 'org.freedesktop.DBus.Properties',
    signals: [{ name: 'PropertiesChanged',
                inSignature: 'a{sv}'}]
};

const MediaServer2IFace = {
    name: 'org.mpris.MediaPlayer2',
    methods: [{ name: 'Raise',
                inSignature: '',
                outSignature: '' },
              { name: 'Quit',
                inSignature: '',
                outSignature: '' }],
    properties: [{ name: 'CanRaise',
                   signature: 'b',
                   access: 'read'},
                 { name: 'CanQuit',
                   signature: 'b',
                   access: 'read'}],
};

const MediaServer2PlayerIFace = {
    name: 'org.mpris.MediaPlayer2.Player',
    methods: [{ name: 'PlayPause',
                inSignature: '',
                outSignature: '' },
              { name: 'Pause',
                inSignature: '',
                outSignature: '' },
              { name: 'Play',
                inSignature: '',
                outSignature: '' },
              { name: 'Stop',
                inSignature: '',
                outSignature: '' },
              { name: 'Next',
                inSignature: '',
                outSignature: '' },
              { name: 'Previous',
                inSignature: '',
                outSignature: '' },
              { name: 'SetPosition',
                inSignature: 'a{ov}',
                outSignature: '' }],
    properties: [{ name: 'Metadata',
                   signature: 'a{sv}',
                   access: 'read'},
                 { name: 'Shuffle',
                   signature: 'b',
                   access: 'readwrite'},
                 { name: 'Rate',
                   signature: 'd',
                   access: 'readwrite'},
                 { name: 'LoopStatus',
                   signature: 'b',
                   access: 'readwrite'},
                 { name: 'Volume',
                   signature: 'd',
                   access: 'readwrite'},
                 { name: 'PlaybackStatus',
                   signature: 's',
                   access: 'read'},
                 { name: 'Position',
                   signature: 'x',
                   access: 'read'},
                 { name: 'CanGoNext',
                   signature: 'b',
                   access: 'read'},
                 { name: 'CanGoPrevious',
                   signature: 'b',
                   access: 'read'},
                 { name: 'CanPlay',
                   signature: 'b',
                   access: 'read'},
                 { name: 'CanPause',
                   signature: 'b',
                   access: 'read'},
                 { name: 'CanSeek',
                   signature: 'b',
                   access: 'read'}],
    signals: [{ name: 'Seeked',
                inSignature: 'x' }]
};

/* global values */
let icon_path;
let compatible_players;
let support_seek;
let indicator;
/* dummy vars for translation */
let x = _("Playing");
x = _("Paused");
x = _("Stopped");


function Prop() {
    this._init.apply(this, arguments);
}

Prop.prototype = {
    _init: function(owner) {
        DBus.session.proxifyObject(this, owner, '/org/mpris/MediaPlayer2', this);
    }
}
DBus.proxifyPrototype(Prop.prototype, PropIFace)

function MediaServer2() {
    this._init.apply(this, arguments);
}

MediaServer2.prototype = {
    _init: function(owner) {
        DBus.session.proxifyObject(this, owner, '/org/mpris/MediaPlayer2', this);
    },
    getRaise: function(callback) {
        this.GetRemote('CanRaise', Lang.bind(this,
            function(raise, ex) {
                if (!ex)
                    callback(this, raise);
            }));
    }
}
DBus.proxifyPrototype(MediaServer2.prototype, MediaServer2IFace)

function MediaServer2Player() {
    this._init.apply(this, arguments);
}

MediaServer2Player.prototype = {
    _init: function(owner) {
        this._owner = owner;
        DBus.session.proxifyObject(this, owner, '/org/mpris/MediaPlayer2', this);
    },
    getMetadata: function(callback) {
        this.GetRemote('Metadata', Lang.bind(this,
            function(metadata, ex) {
                if (!ex)
                    callback(this, metadata);
            }));
    },
    getPlaybackStatus: function(callback) {
        this.GetRemote('PlaybackStatus', Lang.bind(this,
            function(status, ex) {
                if (!ex)
                    callback(this, status);
            }));
    },
    getRate: function(callback) {
        this.GetRemote('Rate', Lang.bind(this,
            function(rate, ex) {
                if (!ex)
                    callback(this, rate);
            }));
    },
    getPosition: function(callback) {
        this.GetRemote('Position', Lang.bind(this,
            function(position, ex) {
                if (!ex)
                    callback(this, position);
            }));
    },
    getShuffle: function(callback) {
        this.GetRemote('Shuffle', Lang.bind(this,
            function(shuffle, ex) {
                if (!ex)
                    callback(this, shuffle);
            }));
    },
    setShuffle: function(value) {
        this.SetRemote('Shuffle', value);
    },
    getVolume: function(callback) {
        this.GetRemote('Volume', Lang.bind(this,
            function(volume, ex) {
                if (!ex)
                    callback(this, volume);
            }));
    },
    setVolume: function(value) {
        this.SetRemote('Volume', parseFloat(value));
    },
    getRepeat: function(callback) {
        this.GetRemote('LoopStatus', Lang.bind(this,
            function(repeat, ex) {
                if (!ex) {
                    if (repeat == "None")
                        repeat = false
                    else
                        repeat = true
                    callback(this, repeat);
                }
            }));
    },
    setRepeat: function(value) {
        if (value)
            value = "Playlist"
        else
            value = "None"
        this.SetRemote('LoopStatus', value);
    }
}
DBus.proxifyPrototype(MediaServer2Player.prototype, MediaServer2PlayerIFace)

function TrackInfo() {
    this._init.apply(this, arguments);
}

TrackInfo.prototype = {
    _init: function(label, icon) {
        this.actor = new St.BoxLayout({style_class: 'track-info'});
        this.label = new St.Label({text: label.toString()});
        this.icon = new St.Icon({icon_name: icon.toString()});
        this.actor.add_actor(this.icon, { span: 0 });
        this.actor.add_actor(this.label, { span: -1 });
    },
    getActor: function() {
        return this.actor;
    },
    setLabel: function(label) {
        this.label.text = label;
    },
    getLabel: function() {
        return this.label.text.toString();
    },
    hide: function() {
        this.actor.hide();
    },
    show: function() {
        this.actor.show();
    },
};

function ControlButton() {
    this._init.apply(this, arguments);
}

ControlButton.prototype = {
    _init: function(icon, callback) {
        this.actor = new St.Bin({style_class: 'button-container'});
        this.button = new St.Button({ style_class: 'button' });
        this.button.connect('clicked', callback);
        this.icon = new St.Icon({
            icon_type: St.IconType.SYMBOLIC,
            icon_name: icon,
            style_class: 'button-icon',
        });
        this.button.set_child(this.icon);
        this.actor.add_actor(this.button);

    },
    getActor: function() {
        return this.actor;
    },
    setIcon: function(icon) {
        this.icon.icon_name = icon;
    },
}

function TextImageMenuItem() {
    this._init.apply(this, arguments);
}

TextImageMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(text, icon, image, align, style) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this);

        this.actor = new St.BoxLayout({style_class: style});
        this.actor.add_style_pseudo_class('active');
        if (icon) {
            this.icon = new St.Icon({icon_name: icon});
        }
        if (image) {
            this.icon = new St.Bin();
            this.icon.set_child(this._getIconImage(image));
        }
        this.text = new St.Label({text: text});
        if (align === "left") {
            this.actor.add_actor(this.icon, { span: 0 });
            this.actor.add_actor(this.text, { span: -1 });
        }
        else {
            this.actor.add_actor(this.text, { span: 0 });
            this.actor.add_actor(this.icon, { span: -1 });
        }
    },

    setText: function(text) {
        this.text.text = text;
    },

    setIcon: function(icon) {
        this.icon.icon_name = icon;
    },

    setImage: function(image) {
        this.icon.set_child(this._getIconImage(image));
    },

    // retrieve an icon image
    _getIconImage: function(icon_name) {
         let icon_file = icon_path + icon_name + ".svg";
         let file = Gio.file_new_for_path(icon_file);
         let icon_uri = file.get_uri();
 
         return St.TextureCache.get_default().load_uri_sync(1, icon_uri, 16, 16);
    },
}

function Player() {
    this._init.apply(this, arguments);
}

Player.prototype = {
    __proto__: PopupMenu.PopupMenuSection.prototype,
    
    _init: function(owner) {
        PopupMenu.PopupMenuSection.prototype._init.call(this);

        this._owner = owner;
        this._name = this._owner.split('.')[3];
        this._mediaServerPlayer = new MediaServer2Player(owner);
        this._mediaServer = new MediaServer2(owner);
        this._prop = new Prop(owner);

        this._playerInfo = new TextImageMenuItem(this._getName(), false, "player-stopped", "left", "popup-menu-item");
        this.addMenuItem(this._playerInfo);

        this._trackCover = new St.Bin({style_class: 'track-cover', x_align: St.Align.MIDDLE});
        this._trackCover.set_child(new St.Icon({icon_name: "media-optical-cd-audio", icon_size: 100, icon_type: St.IconType.FULLCOLOR}));
        this._trackInfos = new St.Bin({style_class: 'track-infos', y_align: St.Align.MIDDLE});
        this._trackControls = new St.Bin({style_class: 'playback-control', x_align: St.Align.MIDDLE});

        let mainBox = new St.BoxLayout({style_class: 'track-box'});
        mainBox.add_actor(this._trackCover);
        mainBox.add_actor(this._trackInfos);

        this.addActor(mainBox);

        this.infos = new St.BoxLayout({vertical: true});
        this._artist = new TrackInfo(_('Unknown Artist'), "system-users");
        this._album = new TrackInfo(_('Unknown Album'), "media-optical");
        this._title = new TrackInfo(_('Unknown Title'), "audio-x-generic");
        this._time = new TrackInfo("0:00 / 0:00", "document-open-recent");
        this.infos.add_actor(this._artist.getActor());
        this.infos.add_actor(this._album.getActor());
        this.infos.add_actor(this._title.getActor());
        this.infos.add_actor(this._time.getActor());
        this._trackInfos.set_child(this.infos);

        this._prevButton = new ControlButton('media-skip-backward',
            Lang.bind(this, function () { this._mediaServerPlayer.PreviousRemote(); }));
        this._playButton = new ControlButton('media-playback-start',
            Lang.bind(this, function () { this._mediaServerPlayer.PlayPauseRemote(); }));
        this._stopButton = new ControlButton('media-playback-stop',
            Lang.bind(this, function () { this._mediaServerPlayer.StopRemote(); }));
        this._nextButton = new ControlButton('media-skip-forward',
            Lang.bind(this, function () { this._mediaServerPlayer.NextRemote(); }));

        this.controls = new St.BoxLayout();
        this.controls.add_actor(this._prevButton.getActor());
        this.controls.add_actor(this._playButton.getActor());
        this.controls.add_actor(this._stopButton.getActor());
        this.controls.add_actor(this._nextButton.getActor());
        this._trackControls.set_child(this.controls);
        this.addActor(this._trackControls);

        this._mediaServer.getRaise(Lang.bind(this, function(sender, raise) {
            if (raise) {
                this._raiseButton = new ControlButton('go-up',
                    Lang.bind(this, function () { this._mediaServer.RaiseRemote(); }));
                this.controls.add_actor(this._raiseButton.getActor());
            }
        }));

        this._volumeInfo = new TextImageMenuItem(_("Volume"), "audio-volume-high", false, "right", "volume-menu-item");
        this._volume = new PopupMenu.PopupSliderMenuItem(0, {style_class: 'volume-slider'});
        this._volume.connect('value-changed', Lang.bind(this, function(item) {
            this._mediaServerPlayer.setVolume(item._value);
        }));
        this.addMenuItem(this._volumeInfo);
        this.addMenuItem(this._volume);

        /*this._trackPosition = new PopupMenu.PopupSliderMenuItem(0, {style_class: 'position-slider'});
        this._trackPosition.connect('value-changed', Lang.bind(this, function(item) {
            this._mediaServerPlayer.SetPositionRemote(this._trackId, item._value * this._songLength);
        }));*/
        /*this.addMenuItem(this._trackPosition);*/
       
        /* this players don't support seek */
        if (support_seek.indexOf(this._name) == -1)
            this._time.hide();
        this._getStatus();
        this._trackId = {};
        this._getMetadata();
        this._getVolume();
        this._currentTime = 0;
        this._getPosition();

        this._prop.connect('PropertiesChanged', Lang.bind(this, function(sender, iface, value) {
            if (value["Volume"])
                this._setVolume(iface, value["Volume"]);
            if (value["PlaybackStatus"])
                this._setStatus(iface, value["PlaybackStatus"]);
            if (value["Metadata"])
                this._setMetadata(iface, value["Metadata"]);
        }));

        this._mediaServerPlayer.connect('Seeked', Lang.bind(this, function(sender, value) {
            this._setPosition(sender, value);
        }));
    },

    _getName: function() {
        return this._name.charAt(0).toUpperCase() + this._name.slice(1);
    },


    _setName: function(status) {
        this._playerInfo.setText(this._getName() + " - " + _(status));
    },

    _formatTrackInfo: function(text) {
        text = text.toString();
        if (text.length > 25) {
            text = text.substr(0, 25) + "...";
        }
        return text;
    },

    _setPosition: function(sender, value) {
        this._stopTimer();
        this._currentTime = value / 1000000;
        if (this._playerStatus == "Playing")
            this._runTimer();
    },

    _getPosition: function() {
        this._mediaServerPlayer.getPosition(Lang.bind(this, 
            this._setPosition
        ));
    },

    _setMetadata: function(sender, metadata) {
        if (metadata["mpris:length"]) {
            // song length in secs
            this._songLength = metadata["mpris:length"] / 1000000;
            // FIXME upstream
            if (this._name == "quodlibet")
                this._songLength = metadata["mpris:length"] / 1000;
            // reset timer
            this._stopTimer();
            if (this._playerStatus == "Playing")
                this._runTimer();
        }
        else {
            this._songLength = 0;
            this._stopTimer();
        }
        if (metadata["xesam:artist"])
            this._artist.setLabel(this._formatTrackInfo(metadata["xesam:artist"]));
        else
            this._artist.setLabel(_("Unknown Artist"));
        if (metadata["xesam:album"])
            this._album.setLabel(this._formatTrackInfo(metadata["xesam:album"]));
        else
            this._album.setLabel(_("Unknown Album"));
        if (metadata["xesam:title"])
            this._title.setLabel(this._formatTrackInfo(metadata["xesam:title"]));
        else
            this._title.setLabel(_("Unknown Title"));
        /*if (metadata["mpris:trackid"]) {
            this._trackId = {
                _init: function() {
                    DBus.session.proxifyObject(this, this._owner, metadata["mpris:trackid"]);
                }
            }
        }*/

        if (metadata["mpris:artUrl"]) {
            let cover = metadata["mpris:artUrl"].toString();
            cover = decodeURIComponent(cover.substr(7));
            if (! GLib.file_test(cover, GLib.FileTest.EXISTS))
                this._trackCover.set_child(new St.Icon({icon_name: "media-optical-cd-audio", icon_size: 100, icon_type: St.IconType.FULLCOLOR}));
            else {
                let l = new Clutter.BinLayout();
                let b = new Clutter.Box();
                let c = new Clutter.Texture({height: 100, keep_aspect_ratio: true, filter_quality: 2, filename: cover});
                b.set_layout_manager(l);
                b.set_width(120);
                b.add_actor(c);
                this._trackCover.set_child(b);
            }
        }
        else
            this._trackCover.set_child(new St.Icon({icon_name: "media-optical-cd-audio", icon_size: 100, icon_type: St.IconType.FULLCOLOR}));
    },

    _getMetadata: function() {
        this._mediaServerPlayer.getMetadata(Lang.bind(this,
            this._setMetadata
        ));
    },

    _setVolume: function(sender, value) {
        if (value === 0)
            this._volumeInfo.setIcon("audio-volume-muted");
        if (value > 0)
            this._volumeInfo.setIcon("audio-volume-low");
        if (value > 0.30) 
            this._volumeInfo.setIcon("audio-volume-medium");
        if (value > 0.80)
            this._volumeInfo.setIcon("audio-volume-high");
        this._volume.setValue(value);
    },

    _getVolume: function() {
        this._mediaServerPlayer.getVolume(Lang.bind(this,
            this._setVolume
        ));
    },

    _setStatus: function(sender, status) {
        this._playerStatus = status;
        if (status == "Playing") {
            this._playButton.setIcon("media-playback-pause");
            this._runTimer();
        }
        else if (status == "Paused") {
            this._playButton.setIcon("media-playback-start");
            this._pauseTimer(); 
        }
        else if (status == "Stopped") {
            this._playButton.setIcon("media-playback-start");
            this._stopTimer();
        }
        this._playerInfo.setImage("player-" + status.toLowerCase());
        this._setName(status);
    },

    _getStatus: function() {
        this._mediaServerPlayer.getPlaybackStatus(Lang.bind(this,
            this._setStatus
        ));
    },

    _updateRate: function() {
        this._mediaServerPlayer.getRate(Lang.bind(this, function(sender, rate) {
            this._rate = rate;
        }));
    },

    _updateTimer: function() {
        this._time.setLabel(this._formatTime(this._currentTime) + " / " + this._formatTime(this._songLength));
        /*if (this._currentTime > 0)
            this._trackPosition.setValue(this._currentTime / this._songLength);
        else
            this._trackPosition.setValue(0);*/
    },

    _runTimer: function() {
        if (!Tweener.resumeTweens(this)) {
            Tweener.addTween(this,
                { _currentTime: this._songLength, 
                  time: this._songLength - this._currentTime,
                  transition: 'linear',
                  onUpdate: Lang.bind(this, this._updateTimer) });
        }
    },

    _pauseTimer: function() {
        Tweener.pauseTweens(this);
    },

    _stopTimer: function() {
        Tweener.removeTweens(this);
        this._currentTime = 0;
        this._updateTimer();
    },

    _formatTime: function(s) {
        let ms = s * 1000;
        let msSecs = (1000);
        let msMins = (msSecs * 60);
        let msHours = (msMins * 60);
        let numHours = Math.floor(ms/msHours);
        let numMins = Math.floor((ms - (numHours * msHours)) / msMins);
        let numSecs = Math.floor((ms - (numHours * msHours) - (numMins * msMins))/ msSecs);
        if (numSecs < 10)
            numSecs = "0" + numSecs.toString();
        if (numMins < 10 && numHours > 0)
            numMins = "0" + numMins.toString();
        if (numHours > 0)
            numHours = numHours.toString() + ":";
        else
            numHours = "";
        return numHours + numMins.toString() + ":" + numSecs.toString();
    },

}

function Indicator() {
    this._init.apply(this, arguments);
}

Indicator.prototype = {
    __proto__: PanelMenu.SystemStatusButton.prototype,

    _init: function() {
        PanelMenu.SystemStatusButton.prototype._init.call(this, 'audio-x-generic');
        // menu not showed by default
        this.actor.hide();
        this._players = {};
        // watch players
        for (var p=0; p<compatible_players.length; p++) {
            DBus.session.watch_name('org.mpris.MediaPlayer2.'+compatible_players[p], false,
                Lang.bind(this, this._addPlayer),
                Lang.bind(this, this._removePlayer)
            );
        }
        // show players if any on signal
        this.menu.connect('players-loaded', Lang.bind(this,
            function(sender, state) {
                if (this._nbPlayers() == 0)
                    this.actor.hide();
                else
                    this.actor.show();
            }
        ));
    },

    _nbPlayers: function() {
        return Object.keys(this._players).length;
    },

    _addPlayer: function(owner) {
        // ensure menu is empty
        if (this._nbPlayers() == 0)
            this.menu.removeAll();
        this._players[owner] = new Player(owner);
        this.menu.addMenuItem(this._players[owner]);
        this.menu.emit('players-loaded', true);
    },

    _removePlayer: function(owner) {
        delete this._players[owner];
        this.menu.removeAll();
        for (owner in this._players) { 
            this._addPlayer(owner);
        }
        this.menu.emit('players-loaded', true);
    }
};

function init(metadata) {
    imports.gettext.bindtextdomain('gnome-shell-extension-mediaplayer', metadata.locale);
    icon_path = metadata.path + '/icons/';
    compatible_players = metadata.players;
    support_seek = metadata.support_seek;
}

function enable() {
    indicator = new Indicator();
    Main.panel.addToStatusArea('mediaplayer', indicator);
}

function disable() {
    indicator.destroy();
}
