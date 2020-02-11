'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

const promisePool = require('es6-promise-pool');
const PromisePool = promisePool.PromisePool;
// Maximum concurrent account deletions.
const MAX_CONCURRENT = 3;

/**
 * Run once a day at midnight, to cleanup the users
 * Manually run the task here https://console.cloud.google.com/cloudscheduler
 */
exports.accountcleanup = functions.pubsub.schedule('every day 00:00').onRun(async context => {
    // Fetch all user details.
    const inactiveUsers = await getInactiveUsers();
    // Use a pool so that we delete maximum `MAX_CONCURRENT` users in parallel.
    const promisePool = new PromisePool(() => deleteInactiveUser(inactiveUsers), MAX_CONCURRENT);
    await promisePool.start();
    console.log('User cleanup finished');
});

/**
 * Deletes one inactive user from the list.
 */
async function deleteInactiveUser(inactiveUsers) {
    if (inactiveUsers.length > 0) {
        const userToDelete = inactiveUsers.pop();

        // Delete the inactive user.
        try {
            await admin.auth().deleteUser(userToDelete.uid);
            return console.log('Deleted user account', userToDelete.uid, 'because of inactivity');
        }
        catch (error) {
            return console.error('Deletion of inactive user account', userToDelete.uid, 'failed:', error);
        }
    } else {
        return null;
    }
}

/**
 * Returns the list of all inactive users.
 */
async function getInactiveUsers(users = [], nextPageToken) {
    const result = await admin.auth().listUsers(1000, nextPageToken);
    // Find users that have not signed in in the last 90 days.
    const inactiveUsers = result.users.filter(user => Date.parse(user.metadata.lastSignInTime) < (Date.now() - 90 * 24 * 60 * 60 * 1000));
    // Concat with list of previously found inactive users if there was more than 1000 users.
    users = users.concat(inactiveUsers);
    // If there are more users to fetch we fetch them.
    if (result.pageToken) {
        return getInactiveUsers(users, result.pageToken);
    }
    return users;
}