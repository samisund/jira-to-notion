import { CronJob } from 'cron';
import JiraApi from 'jira-client';
import {
  Client,
  APIErrorCode
} from "@notionhq/client"
import 'dotenv/config'

const jira = new JiraApi({
  protocol: 'https',
  host: process.env.JIRA_HOST,
  username: process.env.JIRA_USER,
  password: process.env.JIRA_TOKEN,
  apiVersion: '2',
  strictSSL: true
});

const notion = new Client({
  auth: process.env.NOTION_TOKEN
})

const job = new CronJob(`${process.env.CRON_TIMING}`, function() {

  // Write here your own JQL to get issues that you want.
  jira.searchJira(`${process.env.JIRA_JQL}`)
    .then(response => {
      const issuesToBeSearched = response.issues.map(issue => {
        //console.log(JSON.stringify(issue, null, 2))
        // MAP properties ready for Notion create page
        const notionPageObject = {
          "parent": {
            "database_id": process.env.NOTION_DB,
          },
          "properties": {
            "Task": {
              "title": [{
                "text": {
                  "content": issue.fields.summary,
                },
              }, ],
            },
            "Status": {
              "select": {
                "name": "Not started"
              }
            },
            "jira_issue": {
              "rich_text": [{
                "text": {
                  "content": issue.key,
                },
              }, ],
            },
            "URL": {
              "url": `https://${process.env.JIRA_HOST}/browse/${issue.key}`
            },

            "Owner": {
              "people": [{
                "object": "user",
                "id": "e73f2585-0aea-431c-a3a6-c61eeedebab6"
              }]
            }
          },
        }

        // If task has duedate, add it to the page object also!
        if(typeof issue.fields.duedate !== 'undefined' && issue.fields.duedate ) {
          notionPageObject.properties["Due date"] = {
            "date": {
              "start": issue.fields.duedate
            }
          };
        }

        // Return formatted page object
        return notionPageObject;

      });
      //console.log(JSON.stringify(issuesToBeSearched, null, 2));

      // Try to find issues from your Notion DB
      notion.databases.query({
          database_id: process.env.NOTION_DB,
          filter: {
            or: issuesToBeSearched.map(issue => {
              return {
                property: "jira_issue",
                text: {
                  equals: issue.properties.jira_issue.rich_text[0].text.content
                }
              }
            })
          },
        })
        .then(response => {

          const existingIssues = response.results.map(task => task.properties.jira_issue.rich_text[0].plain_text).sort();
          //console.log(`Looked: ${issuesToBeSearched.map(issue => issue.properties.jira_issue.rich_text[0].text.content).sort()}`)
          //console.log(`Found: ${existingIssues}`);

          const newIssues = issuesToBeSearched.filter(issue => existingIssues.indexOf(issue.properties.jira_issue.rich_text[0].text.content) === -1);

          if(newIssues.length > 0) {
            console.log(`New tasks (${newIssues.length} items): ${newIssues.map(issue => issue.properties.jira_issue.rich_text[0].text.content).sort()}`);
          } else {
            console.log(`No new tasks.`);
          }

          // For every new issue make create request.
          newIssues.forEach((issue) => {
            notion.pages.create(issue)
              .then(
                console.log(`Created: ${issue.properties.jira_issue.rich_text[0].text.content}`)
              )
              .catch(err => {
                console.error(err);
              });
          });
        })
        .catch(err => {
          console.error(err);
        });

    })
    .catch(err => {
      console.error(err);
    });


}, null, true, 'Europe/Helsinki');

job.start();
