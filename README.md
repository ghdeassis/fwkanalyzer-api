# FwkAnalyzer API

FwkAnalyzer is a tool for helping determine a developer expertise in a specific framework or library. This is done by 
comparing the framework usage a developer's contributions in GitHub public repositories with a previously generated  
benchmark. 

This is the backend project. The frontend project is available on the following link:
https://github.com/ghdeassis/fwkanalyzer-web

## Setup

Install the dependencies with the following command:

``npm install``

Create a .env file in the project root, with a key named GITHUB_KEY, and put the value as your GitHub API key. You can
get that in your GitHub account. The file should looks like this, replacing the sequence of x by the key:
``GITHUB_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx``

This project was developed using Node.js v.14.17.0, as described in .nvmrc file.

## How to Run

### To integrate a new framework into the tool
Before analyzing a developer expertise in a framework, FwkAnalyzer needs to create a benchmark for that framework
if it has not already been created. 

To integrate a new framework into the tool, you need to open the integrate.js file
and set the framework name, programming language, the commands list that will be analyzed, the file extensions where
the tool will search these commands and the framework file name, where the tool will search the framework name to check
whether the analyzed repository uses the framework or not.

After setting this information, you need to run the script using the following command:

``node integrate.js``

After the process finish, a file named "result.json" is created inside a folder with the framework name, inside the 
data folder in the project root. If a result.json file is already built for the framework, you don't need to run this 
step again, unless you want to analyze a different group of commands 

### To start the API
To start the API to allow the interface to consume the endpoints to perform a developer analysis, you just need to run
the index.js file with the following command:

``node index.js``