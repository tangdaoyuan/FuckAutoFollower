import { Octokit } from "@octokit/core";
import fs from "fs/promises";


// TODO
// more rules for robot
function isRobot(user) {
  return user.following > 1000
}

async function getRobots(isRobot) {
  const octokit = new Octokit({
    auth: process.env.API_TOKEN,
  });

  const followers = []
  const perPage = 100

  while (true) {
    const resp = await octokit.request('GET /user/followers', {
      per_page: perPage,
      page: 1,
    })

    let users = []
    if (resp.status !== 200) {
      console.error('Error:', resp.status);
    } else {
      users = resp.data.map(d =>
        d.login
      )
    }

    followers.push(...users)

    if (users.length < perPage) {
      break
    }
  }

  try {
    const filename = 'followers.json'
    const historyFollowers = JSON.parse(await fs.readFile(filename))
    await fs.writeFile(filename, JSON.stringify(followers))

    const sets = new Set(followers)
    const unFollowers = historyFollowers.filter(f => !sets.has(f))

    const p = unFollowers
      .map(async (f) => {
        const resp = await octokit.request('GET /users/{username}', {
          username: f,
        })
        if (resp.status !== 200)
          return null

        const { data } = resp
        if (isRobot(data))
          return data.login

        return null
      })
    return (await Promise.all(p)).filter(r => r !== null)
  } catch (error) {
    console.log(error)
  }
  return []
}

async function updateRecords(robots) {
  try {
    const content = await fs.readFile('robots.json')
    const data = JSON.parse(content)
    const allRobots = Array.from(new Set([...data, ...robots]))
    await fs.writeFile('robots.json', JSON.stringify(allRobots))
    return allRobots
  } catch (error) {
    console.error(error)
  }
  return []
}

async function updateREADME(robots) {
  try {
    const content = await fs.readFile('README.md')
    const data = content.toString()

    const robotStr = robots.map(r => `- [${r}](https://github.com/${r})`).join('\n')
    const newData = data.replace(/(?<=##\sAuto\sFollowers\n)([\s\S])*(?=\n##\sTODO)/g, `${robotStr}\n`)

    await fs.writeFile('README.md', newData)
  } catch (error) {
    console.error(error)
  }
}

const newRobots = await getRobots(isRobot)
const allRobots = await updateRecords(newRobots)
await updateREADME(allRobots)

console.log('done')
