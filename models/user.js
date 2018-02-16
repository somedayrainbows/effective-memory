const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const query = require('../db/index').query;

const userSerializer = require('../serializers/user');

exports.all = async () => {
  const users = (await query('SELECT * FROM "users"')).rows;
  return users;
};

exports.authenticate = async credentials => {
  const user = (await query('SELECT * FROM "users" WHERE "email" = $1', [
    credentials.email,
  ])).rows[0];

  const valid = user
    ? await bcrypt.compare(credentials.password, user.passwordDigest)
    : false;

  if (valid) {
    const serializedUser = await userSerializer(user);
    const token = jwt.sign({ currentUserId: user.id }, process.env.JWT_SECRET);
    return { jwt: token, user: serializedUser };
  } else {
    return { errors: ['Email or Password is incorrect'] };
  }
};

exports.create = async properties => {
  const errors = await validate(properties);
  if (errors) {
    return { errors };
  }

  const saltRounds = 10;
  const salt = bcrypt.genSaltSync(saltRounds);
  const passwordDigest = bcrypt.hashSync(properties.password, salt);

  const createdUser = (await query(
    `INSERT INTO "users"(
      "firstName",
      "lastName",
      "email",
      "birthYear",
      "student",
      "passwordDigest"
    ) values ($1, $2, $3, $4, $5, $6) returning *`,
    [
      properties.firstName,
      properties.lastName,
      formatEmail(properties.email),
      properties.birthYear,
      properties.student,
      passwordDigest,
    ]
  )).rows[0];
  return createdUser;
};

exports.find = async id => {
  const user = (await query('SELECT * FROM "users" WHERE "id" = $1 LIMIT 1', [
    id,
  ])).rows[0];
  return user;
};

exports.findBy = async property => {
  const key = Object.keys(property)[0];
  let findByQuery;
  switch (key) {
  case 'firstName':
    findByQuery = 'SELECT * FROM "users" WHERE "firstName" = $1 LIMIT 1';
    break;
  case 'lastName':
    findByQuery = 'SELECT * FROM "users" WHERE "lastName" = $1 LIMIT 1';
    break;
  case 'email':
    findByQuery = 'SELECT * FROM "users" WHERE "email" = $1 LIMIT 1';
    break;
  case 'birthYear':
    findByQuery = 'SELECT * FROM "users" WHERE "birthYear" = $1 LIMIT 1';
    break;
  case 'student':
    findByQuery = 'SELECT * FROM "users" WHERE "student" = $1 LIMIT 1';
    break;
  }

  const value = property[key];
  const user = (await query(findByQuery, [value])).rows[0];
  return user;
};

exports.update = async newProperties => {
  const oldProps = await this.find(newProperties.id);
  const properties = { ...oldProps, ...newProperties };
  if (newProperties.password) {
    const saltRounds = 10;
    const salt = bcrypt.genSaltSync(saltRounds);
    const passwordDigest = bcrypt.hashSync(newProperties.password, salt);
    properties.passwordDigest = passwordDigest;
  }

  const errors = await validate(properties);
  if (errors) {
    return { errors };
  }

  const updatedUser = (await query(
    `UPDATE "users" SET
    "firstName"=$1,
    "lastName"=$2,
    "email"=$3,
    "birthYear"=$4,
    "student"=$5,
    "passwordDigest"=$6 WHERE id=$7 RETURNING *`,
    [
      properties.firstName,
      properties.lastName,
      formatEmail(properties.email),
      properties.birthYear,
      properties.student,
      properties.passwordDigest,
      properties.id,
    ]
  )).rows[0];

  return updatedUser;
};

function formatEmail(email) {
  return email.trim().toLowerCase();
}

async function validate(properties) {
  const errors = [];

  const existingEmailUser = await exports.findBy({ email: properties.email });
  const thatEmailIsntMe = existingEmailUser ? existingEmailUser.id !== Number(properties.id) : false;
  if (existingEmailUser && thatEmailIsntMe) {
    const error = 'Email already taken';
    errors.push(error);
  }

  if (errors.length > 0) {
    return errors;
  }
}
