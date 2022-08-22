import { Octokit } from "@octokit/core";
import fs from "fs/promises";


const octokit = new Octokit({
  auth: process.env.API_TOKEN,
});

// TODO
// more rules for robot
function isRobot(user) {
  return (user?.following || 0) > 1000
}


async function getHistoryFollowers() {
  try {
    const filename = 'follower_ids.json'
    const followerWithIds = JSON.parse(await fs.readFile(filename))
    return followerWithIds
  } catch (error) {
    console.log(error)
  }
  return []
}

async function updateHistoryFollowers(followers) {
  // Record ids
  try {
    const filename = 'follower_ids.json'
    const followerWithIds = await getHistoryFollowers()

    for (const follower of followers) {
      if (!followerWithIds[follower.id]) {
        const resp = await octokit.request('GET /user/{id}', {
          id: follower.id,
        })
        followerWithIds[follower.id] = { ...follower, following: resp?.data?.following || 0 }
      }
    }

    await fs.writeFile(filename, JSON.stringify(followerWithIds))
  } catch (error) {
    console.log(error)
  }
}

async function getRobots(isRobot) {
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
      users = resp.data.map(d => ({
        login: d.login,
        id: d.id,
      }))
    }

    followers.push(...users)

    if (users.length < perPage) {
      break
    }
  }

  const followerIds = followers.map(f => f.id)


  // Record id => follower
  await updateHistoryFollowers(followers)

  try {
    const followerWithIds = await getHistoryFollowers()

    const filename = 'followers.json'
    const historyFollowers = JSON.parse(await fs.readFile(filename))
    await fs.writeFile(filename, JSON.stringify(followerIds))

    const sets = new Set(followerIds)
    const unFollowers = historyFollowers.filter(f => !sets.has(f))

    const p = unFollowers
      .map(async (f) => {
        try {
          const resp = await octokit.request('GET /user/{id}', {
            id: f,
          })
          if (resp.status !== 200)
            return null

          const { data } = resp

          if (isRobot(data))
            return data

          if (isRobot(followerWithIds[data.id])) {
            return data
          }

        } catch (error) {
          if (error?.response?.status === 404) {
            console.log(`【${f}】Username Changed`)
            return null
          }
        }

        return null
      })
    return (await Promise.all(p)).filter(r => r !== null)
  } catch (error) {
    console.log(error)
  }
  return []
}

async function updateRobotRecords(robots) {
  try {
    const nameFile = 'robots.json'
    const idFile = 'robots_ids.json'
    const content = await fs.readFile(nameFile)
    const data = JSON.parse(content)
    const allRobots = Array.from(new Set([...data, ...robots.map(r => r.login)]))
    await fs.writeFile(nameFile, JSON.stringify(allRobots))

    const historyIds = JSON.parse(await fs.readFile(idFile))
    await fs.writeFile(
      idFile,
      JSON.stringify(
        Array.from(new Set([
          ...historyIds,
          ...robots.map(r => r.id)
        ]))
      )
    )
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
const allRobots = await updateRobotRecords(newRobots)
await updateREADME(allRobots)

console.log('done')
