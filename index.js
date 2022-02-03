import JiraApi from 'jira-client';
import { Client, APIErrorCode } from "@notionhq/client"
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

jira.searchJira('assignee = 5cac3bf9c0b5612798e25d79 AND status not in (Closed, DONE, Resolved) AND project not in (ASSET, TEMPLATES)')
  .then(response => {
    const issuesToBeSearched = response.issues.map(issue => {
      //console.log(JSON.stringify(issue, null, 2))
      return {
        key: issue.key,
        summary: issue.fields.summary,
        description: issue.fields.description
      }
    })
    //console.log(JSON.stringify(issuesToBeSearched, null, 2))

    notion.databases.query({
      database_id: process.env.NOTION_DB,
      filter: {
        or: issuesToBeSearched.map(issue => {
          return {
            property: "jira_issue",
            text: {
              equals: issue.key
            }
          }
        })
      },
    })
      .then(response => {

        const existingIssues = response.results.map(task => task.properties.jira_issue.rich_text[0].plain_text)
        //console.log(`Looked: ${issuesToBeSearched.map(issue => issue.key)}`)
        //console.log(`Found: ${existingIssues}`);

        const newIssues = issuesToBeSearched.filter(issue => existingIssues.indexOf(issue.key) === -1)
        console.log(`To be created: ${newIssues.map(issue => issue.key)}`);

        newIssues.forEach((issue) => {
          notion.pages.create({
            parent: {
              database_id: process.env.NOTION_DB,
            },
            properties: {
              Task: {
                title: [
                  {
                    text: {
                      content: issue.summary,
                    },
                  },
                ],
              },
              jira_issue: {
                rich_text: [
                  {
                    text: {
                      content: issue.key,
                    },
                  },
                ],
              },
            },
          })
            .then(
              console.log(`Created: ${issue.key}`)
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
