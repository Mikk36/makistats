"use strict";
var makiStatsApp = angular.module('makiStatsApp', []);

makiStatsApp.controller('MainCtrl', function ($scope, $http, $timeout) {
	$http.get("client.json?" + Date.now())
  .success(function(data, status) {
    $scope.addSuccessMessage(status, "JSON successfully loaded.");
    $scope.data = data;
  })
  .error(function(data, status) {
    $scope.addErrorMessage(status, "An error occured.");
  });
  
  $scope.Object = Object;
  
  $scope.getCount = function(what) {
    var count = 0;
    
    if($scope.data) {
      angular.forEach($scope.data.messages, function(message, key) {
        //console.log("Counting");
        switch(what) {
          case "ordered":
            if(message.orderDate !== false) {
              count++;
            }
            break;
          case "notice":
            if(message.orderDate !== false
                && message.noticeDate !== false
                && message.trackingDate === false
                && message.receivedDate === false
                && message.cancelDate === false) {
              count++;
            }
            break;
          case "tracking":
            if(message.orderDate !== false
                && message.trackingDate !== false
                && message.receivedDate === false
                && message.cancelDate === false) {
              count++;
            }
            break;
          case "received":
            if(message.orderDate !== false
                && message.receivedDate !== false
                && message.cancelDate === false) {
              count++;
            }
            break;
          case "cancelled":
            if(message.orderDate !== false
                && message.cancelDate !== false) {
              count++;
            }
            break;
        }
      });
    }
    
    return count;
  };
  
  $scope.successList = [];
  $scope.errorList = [];
  
  $scope.addSuccessMessage = function(status, message) {
    var successObject = {
      status:   status,
      message:  message
    };
    $scope.successList.push(successObject);
    $timeout(function() {
      $scope.successList.splice(successObject, 1);
    }, 5000);
  };
  
  $scope.addErrorMessage = function(status, message) {
    var errorObject = {
      status:   status,
      message:  message
    };
    $scope.errorList.push(errorObject);
    $timeout(function() {
      $scope.errorList.splice(errorObject, 1);
    }, 20000);
  };
  
  $scope.timetag = Date.now();
});