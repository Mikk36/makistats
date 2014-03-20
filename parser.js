/*
  makibox post parser
  
  @author Mikk Kiilaspää <mikk36@mikk36.eu>
*/
var util = require("util");
var http = require("http");
var url = require("url");
var fs = require("fs");
var json2csv = require("json2csv");
var jsdom = require("jsdom");
var window = jsdom.jsdom().createWindow();
var $ = require("jquery")(window);

var ignorePostIDList = [
  10063
];

function MakiboxParser() {
  var self = this;
  
  self.fullJsonFile = "full.json";
  self.clientJsonFile = "client.json";
  self.CSVFile = "client.csv";
  
  self.previousData = [];
  self.previousIDList = {};
  self.newData = {
    scrapeDate: new Date(),
    messages: []
  };
  self.newClientData;
  
  self.startFetching = function() {
    self.loadPreviousData();
    self.fetchPage();
  };
  
  self.finishFetching = function() {
    self.makeClientJSON();
    self.saveData();
    self.saveCSV();
  };
  
  self.fetchPage = function(pageNumber) {
    if(pageNumber === undefined) {
      pageNumber = 1;
    }
    
    http.get("http://makibox.com/forum/topic/2042?page=" + pageNumber, function(res) {
      var body = "";
      res.on("data", function(chunk) {
        body += chunk;
      });
      res.on("end", function() {
        var html = $(body);
        self.parsePage(html);
        
        if($("span.pagenavactive + a.pagenavlink", html).length > 0) {
          self.fetchPage(pageNumber + 1);
        } else {
          self.finishFetching();
        }
        //self.finishFetching();
      });
    }).on("error", function(e) {
    });
  };
  
  self.parsePage = function(html) {
    $("#forum .message-container", html).each(function() {
      var messageID = parseInt($(this).attr("id").split("_")[1], 10);
      if(ignorePostIDList.indexOf(messageID) !== -1) {
        return;
      }
      
      var messagePoster = $(".poster", this).text().trim();
      var messageTime = self.parseDateForum($(".bottom-left", this).text().trim());
      var messageText = $(".helpdesk-messageblock", this).text().trim();
      
      var previousEntry = {};
      if(self.previousData.messages !== undefined && self.previousIDList[messageID] !== undefined) {
        //util.log("Found old data for " + messageID);
        previousEntry = self.previousData.messages[self.previousIDList[messageID]];
      } else {
        util.log("Could not find old data for " + messageID);
      }
      
      var lastModified;
      if(previousEntry.text !== messageText) {
        util.log("Message modified, ID: " + messageID);
        //util.log("previousEntry.text type: " + typeof previousEntry.text);
        //util.log("messageText type: " + typeof messageText);
        //util.log(previousEntry.text);
        //util.log(messageText);
        lastModified = new Date();
      } else {
        //util.log("Message identical");
        lastModified = previousEntry.lastModified;
      }
      
      //util.log("ID: " + messageID + " Time: " + messageTime + " Message poster: " + messagePoster);
      
      var product;
      var ramen = false;
      var productColor;
      var orderDate = false;
      var noticeDate = false;
      var trackingDate = false;
      var shippingDestination;
      var shippingMethod;
      var receivedDate = false;
      var cancelDate = false;
      
      // 1. Ordered HT Case color: Clear on 2013-05-13
      // 2. Received production notice on YYYY-MM-DD
      // 3. Received shipping tracking on YYYY-MM-DD
      // 4. Product is being shipped to Estonia via Express shipping.
      // 5. Received product on YYYY-MM-DD
      // Updated at 2013-11-21

      
      var textLines = messageText.split("\n");
      var lineNumber = 1;
      loopLines:
      for(var i in textLines) {
        var line = textLines[i].trim();
        var lineLower = line.toLowerCase();
        var lookFor = lineNumber + ".";
        var lookForAlt = lineNumber + ". ";
        if(lineNumber == 1) {
          lookFor += "Ordered";
          lookForAlt += "Ordered";
        }
        if(line.indexOf(lookFor) > -1 || line.indexOf(lookForAlt) > -1) {
          switch(lineNumber) {
            case 1:
              // product
              // productColor
              // orderDate
              var startIndex = lineLower.indexOf("ordered") + 7;
              var endIndex = lineLower.indexOf("color");
              var subStr = lineLower.substring(startIndex, endIndex);
              if(subStr.indexOf("ht") > -1) {
                product = "HT";
              } else if(subStr.indexOf("lt") > -1) {
                product = "LT";
              } else {
                product = "n/a";
              }
              if(product !== "n/a" && subStr.indexOf("ramen") > -1) {
                ramen = true;
              }
              
              startIndex = lineLower.indexOf("color") + 5;
              endIndex = lineLower.indexOf("on");
              subStr = lineLower.substring(startIndex, endIndex);
              if(subStr.indexOf("cle") > -1 || subStr.indexOf("transp") > -1) {
                productColor = "Clear";
              } else if(subStr.indexOf("yel") > -1) {
                productColor = "Yellow";
              } else if(subStr.indexOf("bl") > -1) {
                productColor = "Black";
              } else if(subStr.indexOf("stainless") > -1 || subStr.indexOf("steel") > -1 || subStr.indexOf("ss") > -1) {
                productColor = "Steel";
              } else {
                productColor = "n/a";
              }
              
              startIndex = lineLower.indexOf("on") + 2;
              subStr = lineLower.substring(startIndex);
              orderDate = self.parseDate(subStr);
              break;
            case 2:
              // noticeDate
              var startIndex = lineLower.indexOf("notice") + 6;
              var subStr = lineLower.substring(startIndex);
              if(subStr.indexOf("on") > -1) {
                subStr = subStr.substring(subStr.indexOf("on") + 2);
              }
              noticeDate = self.parseDate(subStr);
              break;
            case 3:
              // trackingDate
              var startIndex = lineLower.indexOf("tracking") + 8;
              var subStr = lineLower.substring(startIndex);
              if(subStr.indexOf("on") > -1) {
                subStr = subStr.substring(subStr.indexOf("on") + 2);
              }
              trackingDate = self.parseDate(subStr);
              break;
            case 4:
              // shippingDestination
              // shippingMethod
              var startIndex = lineLower.indexOf("shipped") + 7;
              var subStr = lineLower.substring(startIndex);
              if(subStr.indexOf("to") > -1) {
                subStr = subStr.substring(subStr.indexOf("to") + 2);
              }
              subStr = subStr.replace(":", "").trim();
              var divider = "by";
              if(subStr.indexOf("via") > -1) {
                divider = "via";
              }
              var parts = subStr.split(divider);
              shippingDestination = parts[0].trim();
              shippingMethod = "n/a";
              if(shippingDestination.length < 2 || shippingDestination.length > 25) {
                shippingDestination = "n/a";
              } else {
                var origIndex = lineLower.indexOf(shippingDestination);
                shippingDestination = line.substr(origIndex, shippingDestination.length);
              }
              if(parts[1] !== undefined) {
                if(parts[1].indexOf("expres") > -1 || parts[1].indexOf("speed") > -1) {
                  shippingMethod = "Express";
                } else if(parts[1].indexOf("standar") > -1 || parts[1].indexOf("slow") > -1) {
                  shippingMethod = "Standard";
                } else if(parts[1].indexOf("pick") > -1) {
                  shippingMethod = "Pickup";
                }
              }
              break;
            case 5:
              // receivedDate
              var startIndex = lineLower.indexOf("5.") + 2;
              var subStr = lineLower.substring(startIndex);
              if(subStr.indexOf("on") > -1) {
                subStr = subStr.substring(subStr.indexOf("on") + 2);
              }
              receivedDate = self.parseDate(subStr);
              break;
            case 6:
              // cancelDate
              var startIndex = lineLower.indexOf("cancel");
              if(startIndex < 0) {
                break;
              }
              startIndex += 6;
              var subStr = lineLower.substring(startIndex);
              if(subStr.indexOf("on") > -1) {
                subStr = subStr.substring(subStr.indexOf("on") + 2);
              }
              cancelDate = self.parseDate(subStr);
              break;
            default:
              if(lineNumber > 1) {
                break loopLines;
              }
          }
          lineNumber++;
        }
      }
      // util.log("Product: " + product + (ramen?"+Ramen":"")
      //   + " Color: " + productColor
      //   + " Ordered: " + orderDate
      //   + " Notice: " + noticeDate
      //   + " Tracking: " + trackingDate
      //   + " Received: " + receivedDate
      //   + " To: " + shippingDestination
      //   + " Method: " + shippingMethod
      //   + " Cancelled: " + cancelDate
      // );
      
      if(lineNumber > 1) {
        var entry = {
          id:                   messageID,
          poster:               messagePoster,
          time:                 messageTime,
          text:                 messageText,
          product:              product,
          ramen:                ramen,
          color:                productColor,
          orderDate:            orderDate,
          noticeDate:           noticeDate,
          trackingDate:         trackingDate,
          shippingDestination:  shippingDestination,
          shippingMethod:       shippingMethod,
          receivedDate:         receivedDate,
          cancelDate:           cancelDate,
          lastModified:         lastModified
        };
        self.newData.messages.push(entry);
      }
    });
  };
  
  self.parseDate = function(source) {
    if(source === undefined || source.length == 0) {
      //util.log("parseDate exit 1");
      return false;
    }
    source = source.replace(":", "").trim();
    var divider = " ";
    if(source.indexOf("/") > -1 && source.indexOf("/", source.indexOf("/") + 1) > -1) {
      divider = "/";
    } else if(source.indexOf("-") > -1 && source.indexOf("-", source.indexOf("-") + 1) > -1) {
      divider = "-";
    }
    var parts = source.split(divider);
    var year = -1;
    var month = -1;
    var day = -1;
    
    if(self.isNumeric(parts[0])) {
      if(parts[2].indexOf(" ") > -1) {
        parts[2] = parts[2].substr(0, parts[2].indexOf(" "));
      }
      if(parts[0].length == 4) {
        // yyyy-mm-dd
        year = parseInt(parts[0], 10);
        month = self.getMonthFromText(parts[1]);
        day = parseInt(parts[2], 10);
      } else {
        if(parseInt(parts[0], 10) > 12) {
          // dd-mm-yyyy
          year = parseInt(parts[2], 10);
          month = self.getMonthFromText(parts[1]);
          day = parseInt(parts[0]);
        } else {
          // mm-dd-yyyy
          year = parseInt(parts[2], 10);
          month = self.getMonthFromText(parts[0]);
          day = parseInt(parts[1]);
        }
      }
    } else {
      if(parts[0].length > 2) {
        year = parseInt(parts[2], 10);
        month = self.getMonthFromText(parts[0]);
        day = parseInt(parts[1]);
      }
    }
    if(year < 2011 || year > 2020 || month < 1 || month > 12 || day < 1 || day > 31) {
      //util.log("parseDate exit 2, year: " + year + " month: " + month + " day: " + day);
      return false;
    }
    return new Date(Date.UTC(year, month - 1, day));
  };
  
  self.parseDateForum = function(source) {
    var dateText = source.split(" ")[0];
    var dateParts = dateText.split("-");
    return new Date(Date.UTC(dateParts[0], parseInt(dateParts[1], 10) - 1, dateParts[2]));
  };
  
  self.getMonthFromText = function(source) {
    if(source === undefined) {
      return -1;
    }
    var month = -1;
    if(source.length < 3) {
      month = parseInt(source, 10);
    } else {
      if(source.indexOf("jan") > -1) {
        month = 1;
      } else if(source.indexOf("feb") > -1) {
        month = 2;
      } else if(source.indexOf("mar") > -1) {
        month = 3;
      } else if(source.indexOf("apr") > -1) {
        month = 4;
      } else if(source.indexOf("may") > -1) {
        month = 5;
      } else if(source.indexOf("jun") > -1) {
        month = 6;
      } else if(source.indexOf("jul") > -1) {
        month = 7;
      } else if(source.indexOf("aug") > -1) {
        month = 8;
      } else if(source.indexOf("sep") > -1) {
        month = 9;
      } else if(source.indexOf("oct") > -1) {
        month = 10;
      } else if(source.indexOf("nov") > -1) {
        month = 11;
      } else if(source.indexOf("dec") > -1) {
        month = 12;
      }
    }
    
    if(month < 1 || month > 12) {
      month = -1;
    }
    return month;
  };
  
  self.loadPreviousData = function() {
    var fileName = process.cwd() + "/htdocs/" + self.fullJsonFile;
    util.log("Reading previous data from: " + fileName);
    var data = fs.readFileSync(fileName, {encoding: "utf8"});
    //util.log(data);
    self.previousData = JSON.parse(data);
    
    for(var i = 0; i < self.previousData.messages.length; i++) {
      self.previousIDList[self.previousData.messages[i].id] = i;
    }
    
    util.log("Previous data loaded");
  };
  
  self.saveData = function() {
    var fileName = process.cwd() + "/htdocs/" + self.fullJsonFile;
    fs.writeFile(fileName, JSON.stringify(self.newData, null, 2), function(err) {
      if(err) {
        throw err;
      }
      console.log("Full JSON saved");
    });
    fileName = process.cwd() + "/htdocs/" + self.clientJsonFile;
    fs.writeFile(fileName, JSON.stringify(self.newClientData), function(err) {
      if(err) {
        throw err;
      }
      console.log("Client JSON saved");
    });
  };
  
  self.saveCSV = function() {
    var fileName = process.cwd() + "/htdocs/" + self.CSVFile;
    json2csv({data: self.newData.messages, fields: ["id", "poster", "time", "product", "ramen", "color", "orderDate", "noticeDate",
      "trackingDate", "shippingDestination", "shippingMethod", "receivedDate", "cancelDate", "lastModified"]}, function(err, csv) {
      if(err) {
        throw err;
      }
      fs.writeFile(fileName, csv, function(err2) {
        if(err2) {
          throw err2;
        }
        console.log("Client CSV saved");
      });
    });
  };
  
  self.makeClientJSON = function() {
    var jsonString = JSON.stringify(self.newData);
    self.newClientData = JSON.parse(jsonString);
    for(var i in self.newClientData.messages) {
      delete self.newClientData.messages[i].text;
    }
  };
  
  self.isNumeric = function(number) {
    return !isNaN(parseFloat(number)) && isFinite(number);
  };
}

var parser = new MakiboxParser();
parser.startFetching();