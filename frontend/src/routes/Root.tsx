import { NavLink, Outlet, useNavigation } from "react-router-dom";
import Container from 'react-bootstrap/Container';
import Nav from "react-bootstrap/Nav";
import Navbar from "react-bootstrap/Navbar";

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCube, faPager, faCubes, faBorderAll, faBook } from '@fortawesome/free-solid-svg-icons';
import { faGithub } from '@fortawesome/free-brands-svg-icons';

import './Root.scss';

export default function Root() {
  const navigation = useNavigation();
  return (
    <>
      <Navbar bg="primary" variant="dark" sticky="top">
        <Container fluid>
          <Navbar.Brand href="/">Project Radius</Navbar.Brand>
          <Nav>
            <Nav.Link href="https://radapp.dev" target="_newtab"><FontAwesomeIcon icon={faBook} fixedWidth /> Docs</Nav.Link>
            <Nav.Link href="https://github.com/project-radius/radius" target="_newtab"><FontAwesomeIcon icon={faGithub} fixedWidth /> GitHub</Nav.Link>
          </Nav>
        </Container>
      </Navbar>
      <div className="Root-container">
        <div className="Root-sidebar">
          <Nav className="sidebar-options flex-column">
            <NavLink to={`environments`}><FontAwesomeIcon icon={faCube} fixedWidth />  Environments</NavLink>
            <NavLink to={`applications`}><FontAwesomeIcon icon={faPager} fixedWidth />  Applications</NavLink>
            <NavLink to={`containers`}><FontAwesomeIcon icon={faCubes} fixedWidth />  Containers</NavLink>
            <NavLink to={`resources`}><FontAwesomeIcon icon={faBorderAll} fixedWidth />  Resources</NavLink>
          </Nav>
        </div>
        <div className={navigation.state === "loading" ? "Root-detail loading" : "Root-detail"}>
          <Outlet />
        </div>
      </div>
    </>
  );
}