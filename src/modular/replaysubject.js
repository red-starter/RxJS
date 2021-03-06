'use strict';

var Disposable = require('./disposable');
var Observable = require('./observable');
var Observer = require('./observer');
var ScheduledObserver = require('./observer/scheduledobserver');
var addProperties = require('./internal/addproperties');
var cloneArray = require('./internal/clonearray');
var inherits = require('util').inherits;

global.Rx || (global.Rx = {});
if (!global.Rx.currentThreadScheduler) {
  require('../scheduler/currentthreadscheduler');
}

var MAX_SAFE_INTEGER = Math.pow(2, 53) - 1;

function createRemovableDisposable(subject, observer) {
  return Disposable.create(function () {
    observer.dispose();
    !subject.isDisposed && subject.observers.splice(subject.observers.indexOf(observer), 1);
  });
}



/**
 * Represents an object that is both an observable sequence as well as an observer.
 * Each notification is broadcasted to all subscribed and future observers, subject to buffer trimming policies.
 *
 *  Initializes a new instance of the ReplaySubject class with the specified buffer size, window size and scheduler.
 *  @param {Number} [bufferSize] Maximum element count of the replay buffer.
 *  @param {Number} [windowSize] Maximum time length of the replay buffer.
 *  @param {Scheduler} [scheduler] Scheduler the observers are invoked on.
 */
function ReplaySubject(bufferSize, windowSize, scheduler) {
  this.bufferSize = bufferSize == null ? MAX_SAFE_INTEGER : bufferSize;
  this.windowSize = windowSize == null ? MAX_SAFE_INTEGER : windowSize;
  this.scheduler = scheduler || global.Rx.currentThreadScheduler;
  this.q = [];
  this.observers = [];
  this.isStopped = false;
  this.isDisposed = false;
  this.hasError = false;
  this.error = null;
  Observable.call(this);
}

inherits(ReplaySubject, Observable);

addProperties(ReplaySubject.prototype, Observer.prototype, {
  _subscribe: function (o) {
    Disposable.checkDisposed(this);
    var so = new ScheduledObserver(this.scheduler, o), subscription = createRemovableDisposable(this, so);

    this._trim(this.scheduler.now());
    this.observers.push(so);

    for (var i = 0, len = this.q.length; i < len; i++) {
      so.onNext(this.q[i].value);
    }

    if (this.hasError) {
      so.onError(this.error);
    } else if (this.isStopped) {
      so.onCompleted();
    }

    so.ensureActive();
    return subscription;
  },
  /**
   * Indicates whether the subject has observers subscribed to it.
   * @returns {Boolean} Indicates whether the subject has observers subscribed to it.
   */
  hasObservers: function () {
    return this.observers.length > 0;
  },
  _trim: function (now) {
    while (this.q.length > this.bufferSize) {
      this.q.shift();
    }
    while (this.q.length > 0 && (now - this.q[0].interval) > this.windowSize) {
      this.q.shift();
    }
  },
  /**
   * Notifies all subscribed observers about the arrival of the specified element in the sequence.
   * @param {Mixed} value The value to send to all observers.
   */
  onNext: function (value) {
    Disposable.checkDisposed(this);
    if (this.isStopped) { return; }
    var now = this.scheduler.now();
    this.q.push({ interval: now, value: value });
    this._trim(now);

    for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
      var observer = os[i];
      observer.onNext(value);
      observer.ensureActive();
    }
  },
  /**
   * Notifies all subscribed observers about the exception.
   * @param {Mixed} error The exception to send to all observers.
   */
  onError: function (error) {
    Disposable.checkDisposed(this);
    if (this.isStopped) { return; }
    this.isStopped = true;
    this.error = error;
    this.hasError = true;
    var now = this.scheduler.now();
    this._trim(now);
    for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
      var observer = os[i];
      observer.onError(error);
      observer.ensureActive();
    }
    this.observers.length = 0;
  },
  /**
   * Notifies all subscribed observers about the end of the sequence.
   */
  onCompleted: function () {
    Disposable.checkDisposed(this);
    if (this.isStopped) { return; }
    this.isStopped = true;
    var now = this.scheduler.now();
    this._trim(now);
    for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
      var observer = os[i];
      observer.onCompleted();
      observer.ensureActive();
    }
    this.observers.length = 0;
  },
  /**
   * Unsubscribe all observers and release resources.
   */
  dispose: function () {
    this.isDisposed = true;
    this.observers = null;
  }
});

module.exports = ReplaySubject;
